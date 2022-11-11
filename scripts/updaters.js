const ethers = require("ethers");
const { toChecksumAddress } = require("ethereum-checksum-address");
const { ERC20_ABI, required, generateTID } = require("./utils");

let nodeID, mode, logger, wallet, tokenTracker, constructTxUrl;
const initUpdaters = (
  _nodeID,
  _mode,
  _logger,
  _wallet,
  _tokenTracker,
  _constructTxUrl
) => {
  nodeID = _nodeID;
  mode = _mode;
  logger = _logger;
  wallet = _wallet;
  tokenTracker = _tokenTracker;
  constructTxUrl = _constructTxUrl;
};
const updateLiquidityToken = async (
  _newAddress,
  _minimumLiquidity,
  _maximumLiquidity
) => {
  let states = {
    liquidityToken: { address: null },
    minimumLiquidity: ethers.BigNumber.from("0"),
    maximumLiquidity: ethers.BigNumber.from("0"),
  };

  if (!["Fairlaunch"].includes(mode)) required(_newAddress, "liquidityToken"); // TODO add auto-magic sometime
  if (_newAddress) {
    states.liquidityToken = new ethers.Contract(
      required(_newAddress, "liquidityToken"),
      ERC20_ABI,
      wallet
    );
    states.minimumLiquidity = ethers.utils.parseUnits(
      String(_minimumLiquidity),
      await states.liquidityToken.decimals()
    );
    states.maximumLiquidity = ethers.utils.parseUnits(
      String(_maximumLiquidity),
      await states.liquidityToken.decimals()
    );

    logger("Liquidity Token set to:", await states.liquidityToken.symbol());
  }

  return states;
};

const updatePurchaseToken = async (
  _purchaseTokenAddress,
  _tokenBuyAmount,
  _realBuyMethod
) => {
  let states = {
    purchaseToken: null,
    tokenBuyAmount: ethers.BigNumber.from("0"),
    realBuyMethod: _realBuyMethod,
  };

  states.purchaseToken = new ethers.Contract(
    _purchaseTokenAddress,
    ERC20_ABI,
    wallet
  );
  let _purchaseTokenDecimals = await states.purchaseToken.decimals();

  let _symb = await states.purchaseToken.symbol();
  try {
    states.tokenBuyAmount = ethers.utils.parseUnits(
      String(_tokenBuyAmount),
      _purchaseTokenDecimals
    );
  } catch (e) {
    if (_realBuyMethod == 0) {
      logger(
        `Token with low decimals encountered! Switching to "realBuyMethod ${1}..."`
      );
      states.realBuyMethod = 1;
    }
  }
  let _adx = states.purchaseToken.address;
  _adx = toChecksumAddress(_adx);
  logger("Token to buy:", _adx);
  logger("View more at:", `https://${tokenTracker}/${_adx}`);
  logger(`Updated Purchase token -> ${_symb}(${states.purchaseToken.address})`);

  return states;
};

const formatLiquidityTokenParams = async (_liquidityTokens) => {
  logger("Setting liquidity token values...");
  for (let i = 0; i < _liquidityTokens.length; i++) {
    let item = _liquidityTokens[i];
    logger("Updating values for:", item.token);
    let _token = new ethers.Contract(item.token, ERC20_ABI, wallet);
    let _decimals = await _token.decimals();
    item.minimumLiquidity = ethers.utils.parseUnits(
      String(item.minimumLiquidity),
      _decimals
    );
    item.maximumLiquidity = ethers.utils.parseUnits(
      String(item.maximumLiquidity),
      _decimals
    );
  }
  logger("Updated all values.");
  return _liquidityTokens;
};

const executeApprove = async (
  _privatekeys,
  _tokenAddress,
  _to,
  _exit = false
) => {
  const _token = new ethers.Contract(_tokenAddress, ERC20_ABI, wallet);
  // if (nodeID == 0) { // FIXME check only when approving before winnerNode
  for (let idx = 0; idx < _privatekeys.length; idx++) {
    await executeApproveForWallet(
      new ethers.Wallet(_privatekeys[idx], wallet.provider),
      _token,
      _to
    );
    if (_exit && idx == _privatekeys.length - 1) process.exit(0);
  }
  return true;
};

const executeApproveForWallet = async (_wallet, _token, _to) => {
  _token = _token.connect(_wallet);
  let _tokenSymb = await _token.symbol();

  logger(`Approving ${_tokenSymb}: From ${_wallet.address} -> To ${_to}...`);
  if (
    (await _token.allowance(_wallet.address, _to)).gt(
      ethers.constants.MaxUint256.div("100")
    )
  ) {
    logger("ALREADY APPROVED!");
    return true;
  }
  try {
    let tx = await _token.approve(_to, ethers.constants.MaxUint256);
    await tx.wait();
    logger(
      `APPROVE SUCCESSFUL - ${_tokenSymb}: From ${_wallet.address} -> To ${_to}...`,
      `${constructTxUrl(tx)}`
    );
    return true;
  } catch (err) {
    logger(
      `!APPROVE FAILED - ${_tokenSymb}: From ${_wallet.address} -> To ${_to}`,
      err
    );
    return false;
  }
};

const generateBuyTx = async (
  _buybot,
  _round,
  _router,
  _purchaseTokenAddress,
  _liquidityTokenAddress,
  _wethAddress,
  _realBuyMethod,
  _tokenBuyAmount,
  _wethSellAmount,
  _recipients,
  _useChecks,
  _checkSellebility,
  _wethForChecks,
  _maxBuyTax,
  _maxSellTax
) => {
  let states = { currentTXID: null, tx: null };
  let TXID = generateTID(_round);
  states.currentTXID = TXID;

  if (!_liquidityTokenAddress || !_purchaseTokenAddress) {
    logger("`liquidityToken` or `purchaseToken` not found!");
    return;
  }

  logger("Generating transaction data for round:", _round + 1);
  let tx = await _buybot.populateTransaction.swapExactETHForTokens(
    _router,
    _purchaseTokenAddress,
    _liquidityTokenAddress ? _liquidityTokenAddress : _wethAddress,
    _realBuyMethod,
    [_tokenBuyAmount ? _tokenBuyAmount : "0", _wethSellAmount],
    _recipients,
    _useChecks,
    _checkSellebility,
    _wethForChecks,
    [_maxBuyTax, _maxSellTax],
    TXID
  );

  states.tx = tx;
  return states;
};

const generateRugPullTx = async (
  _buybot,
  _router,
  _purchaseTokenAddress,
  _liquidityTokenAddress,
  _recipients,
  _params
) => {
  let tx = await _buybot.populateTransaction.swapExactTokensForETH(
    _router,
    _purchaseTokenAddress,
    _liquidityTokenAddress,
    _recipients,
    _params
  );

  return tx;
};

module.exports = {
  initUpdaters,
  executeApprove,
  updateLiquidityToken,
  updatePurchaseToken,
  formatLiquidityTokenParams,
  generateBuyTx,
  generateRugPullTx,
};
