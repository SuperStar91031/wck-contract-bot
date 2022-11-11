const ethers = require("ethers");
const fs = require("fs");
const InputDataDecoder = require("ethereum-input-data-decoder");
const { initLogger, Log, LogFatalException } = require("./logger");
const {
  initUpdaters,
  updateLiquidityToken,
  updatePurchaseToken,
  executeApprove,
  generateRugPullTx,
  generateBuyTx,
  formatLiquidityTokenParams,
} = require("./updaters");
const { getCliArgs } = require("./argParser");
const {
  initUtils,
  ERC20_ABI,
  BUYBOT_ABI,
  getAddressFromPARAM,
  getBalanceOfTokenFmt,
  required,
  assertLog,
  formatMaxTaxes,
  constructTxUrl,
  getTxFailReasonLite,
  getTxFailStatus,
} = require("./utils");
const {
  checkLiquidityAddTx,
  checkRugPullTx,
  checkPercentageGains,
  checkAutoMagicTxV2,
  checkPinksale,
  checkDevAction,
  checkFollowWallet,
  checkFollowWalletSell,
} = require("./transactionCheckers");
const { options } = require("./dev/options");
const PARAMS = require("../params.json");
let _NETWORK_DATA = require("../networkData.json");
const NETWORK_DATA = _NETWORK_DATA[required(PARAMS.network, "network")];
const readline = require("readline");

readline.emitKeypressEvents(process.stdin);
if (process.stdin.setRawMode) process.stdin.setRawMode(true);

const { index, runID, nodeID } = getCliArgs();
const mode = options[index];
initLogger(nodeID, runID);
const cachePath = `./cache/${runID}.json`;

const TokenDB = require("../tokenDB.json");
const checkList = require("../checkList.json");

let _executeSell, resetForAutoMagic, init;

const provider = new ethers.providers.WebSocketProvider(
  required(NETWORK_DATA.websockets[nodeID], "websocket")
);
let errInit = () => {
  provider._websocket.on("error", async (err) => {
    const RETRY_TIME = 3000;
    Log(`${err}: Unable to connect, retrying in ${RETRY_TIME / 1000}s...`);
    if (init) setTimeout(init, RETRY_TIME);
    else setTimeout(errInit, RETRY_TIME);
  });
};
errInit();

let wallet, recipients;
let privatekey = required(PARAMS.privatekeys[0], "privatekey");
try {
  wallet = new ethers.Wallet(privatekey, provider);
  recipients = PARAMS.privatekeys.map((pk) => {
    return new ethers.Wallet(pk, provider).address;
  });
  if (!PARAMS.includeSender) {
    assertLog(
      recipients.length != 1,
      "Either turn on `includeSender` or specify other recipients!"
    );
    recipients = recipients.slice(1);
  }
  Log("Recipients:", recipients);
} catch {
  LogFatalException("Invalid private key.");
}
initUpdaters(
  nodeID,
  mode,
  Log,
  wallet,
  NETWORK_DATA.tokenTracker,
  constructTxUrl
);

let devWalletAddress = getAddressFromPARAM(PARAMS.devWallet);

let IS_EIP1559_AVAILABLE = NETWORK_DATA.eip1559;
required(IS_EIP1559_AVAILABLE, 'networkData.eip1559')
const BLOCK_EXPLORER_TX = `https://${NETWORK_DATA.explorer}/tx/`;
const WETH = new ethers.Contract(NETWORK_DATA.wrapped, ERC20_ABI, wallet);
const ABI_SYMB = NETWORK_DATA.abitoken.toUpperCase();
const WSYMB = NETWORK_DATA.currency;
const uniswapV2R2Decoder = new InputDataDecoder(require(NETWORK_DATA.abi));
let autoMagicLiquidityTokens = NETWORK_DATA.autoMagicLiquidityTokens;

const buyBot = new ethers.Contract(NETWORK_DATA.contract, BUYBOT_ABI, wallet);
required(NETWORK_DATA.router, "router");
const router = new ethers.Contract(
  NETWORK_DATA.router,
  require(NETWORK_DATA.abi),
  wallet
);
initUtils(Log, BLOCK_EXPLORER_TX);

const sellOnPercentageGain = PARAMS.sellOnPercentageGain
  ? PARAMS.sellOnPercentageGain * 100
  : null;
let stopAfterFirstTx = PARAMS.stopAfterFirstTx; // FIXME check implementation
if ((sellOnPercentageGain || PARAMS.antiRugPull) && !stopAfterFirstTx) {
  Log(
    "Turned on `stopAfterFirstTx` since `sellOnPercentageGain` or/and `antiRugPull` is enabled."
  );
  stopAfterFirstTx = true;
}

let purchaseToken = { address: undefined },
  tokenBuyAmount,
  sellToken;
let liquidityToken = { address: undefined },
  minimumLiquidity,
  maximumLiquidity;
if (mode == "Instant Sell")
  sellToken = new ethers.Contract(
    required(PARAMS.sellToken, "sellToken"),
    ERC20_ABI,
    wallet
  );

process.stdin.on("keypress", async (str, key) => {
  switch (key.sequence) {
    case "\x03":
      Log("Ctrl-C, exit!");
      let data = JSON.parse(String(fs.readFileSync(cachePath)));
      data.exit = true;
      fs.writeFileSync(cachePath, JSON.stringify(data));
      process.exit();
    case "\x0E":
      Log("Sell hotkey detected!");
      if (!purchaseToken.address || !liquidityToken.address) {
        Log("Wait till a token-pair is updated and approved!");
        return;
      }
      try {
        pauseSearch = true;
        await _executeSell();
        if (PARAMS.stopAfterFirstTx) process.exit();
        else {
          resetForAutoMagic();
          pauseSearch = false;
        }
      } catch (e) {
        if (PARAMS.stopAfterFirstTx) {
          Log("Transaction FAILED!");
          process.exit();
        } else {
          resetForAutoMagic();
          pauseSearch = false;
        }
      }
  }
});

let balanceCheckMultiplier = String(
  PARAMS.balanceCheckMultiplier ? PARAMS.balanceCheckMultiplier : 1
);

let sellThresholdFall;
if (sellOnPercentageGain)
  sellThresholdFall = String(
    required(PARAMS.sellThresholdFall, "sellThresholdFall")
  );

let realBuyMethod = required(PARAMS.realBuyMethod, "realBuyMethod");
!PARAMS.useChecks && Log("Tax checker turned off.");

const wethSellAmount = ethers.utils.parseEther(
  String(required(PARAMS.wethSellAmount, "wethSellAmount"))
);
const wethForChecks = PARAMS.useChecks
  ? ethers.utils.parseEther(
      String(required(PARAMS.wethForChecks, "wethForChecks"))
    )
  : "0";

if (!PARAMS.checkSellebility && PARAMS.useChecks)
  Log("Sell tax checker turned off.");

const maxBuyTax = formatMaxTaxes(
  PARAMS.maxBuyTax,
  PARAMS.maxBuyTax,
  PARAMS.useChecks,
  "buy",
  Log
);
const maxSellTax = formatMaxTaxes(
  PARAMS.maxSellTax,
  PARAMS.maxSellTax && PARAMS.checkSellebility,
  PARAMS.useChecks,
  "sell",
  Log
);

const realBuyGas = PARAMS.realBuyGas
  ? ethers.utils.parseUnits(String(PARAMS.realBuyGas), 9)
  : null;
const priorityGas = PARAMS.priorityGas
  ? ethers.utils.parseUnits(String(PARAMS.priorityGas), 9)
  : null;
required(PARAMS.gasLimit, "gasLimit");

let followMaxGas = {};
followMaxGas.gasPrice = NETWORK_DATA.followMaxGas.price
  ? ethers.utils.parseUnits(String(NETWORK_DATA.followMaxGas.price), 9)
  : ethers.constants.MaxUint256;
followMaxGas.maxFeePerGas = NETWORK_DATA.followMaxGas.price
  ? ethers.utils.parseUnits(String(NETWORK_DATA.followMaxGas.price), 9)
  : ethers.constants.MaxUint256;

// Transaction scheduling parameters
const waitBeforeFirstBuy = PARAMS.waitBeforeFirstBuy * 1000; // convert to milliseconds
const delayBetweenBuys = PARAMS.delayBetweenBuys * 1000; // convert to milliseconds
let roundsToBuy = PARAMS.roundsToBuy;

// Internal vars
let detectRugPullNowOn = false,
  detectGainsNowOn = false,
  detectFollowSellNowOn = false,
  priceAtBuy = null,
  firstTxCaught = false;
let args = { init: false };

// -------------------------------- Transaction scheduling helper vars ---------------------------------
let currentBlock;
let txByBlock = {}; // Maintains transactions that are needed to be done at a specific block
let txObjects = []; // Used for checking if all the transactions have succeeded

let lastOut, lastGasPrice;
let retryRounds = PARAMS.retryRounds,
  retriesCompleted = 0,
  retryDelay = PARAMS.retryDelay * 1000;
let pauseSearch = false,
  inSecondStage = false,
  followed = null;
let purchaseTokenBalance, previousToken;

// Caches the transaction to send it faster
let rawTx = { tx: null, round: null };

let secondStageTx;
let currentTXID = undefined;

// --------------------------------- --------------------------------- ---------------------------------

const updateBuyTx = async (round) => {
  let states = await generateBuyTx(
    buyBot,
    round,
    NETWORK_DATA.router,
    purchaseToken.address,
    liquidityToken.address,
    WETH.address,
    realBuyMethod,
    tokenBuyAmount,
    wethSellAmount,
    recipients,
    PARAMS.useChecks,
    PARAMS.checkSellebility,
    wethForChecks,
    maxBuyTax,
    maxSellTax
  );
  currentTXID = states.currentTXID;
  rawTx = { tx: states.tx, round };
};

const updateSecondStageTx = async () => {
  Log("Generating transaction data for sell event...");
  secondStageTx = await generateRugPullTx(
    buyBot,
    NETWORK_DATA.router,
    purchaseToken.address,
    liquidityToken.address,
    recipients,
    [ethers.constants.WeiPerEther, 0]
  );
};

resetForAutoMagic = () => {
  if (!["Auto-Magic", "Follow Wallets"].includes(mode)) process.exit();

  Log("Resetting for sniping new tokens!");

  purchaseToken = { address: undefined };
  tokenBuyAmount = undefined;
  sellToken = undefined;
  liquidityToken = { address: undefined };
  minimumLiquidity = undefined;
  maximumLiquidity = undefined;
  secondStageTx = null;
  detectGainsNowOn = detectRugPullNowOn = detectFollowSellNowOn = false;
  rawTx = { tx: null, round: null };
  args.init = false;
  inSecondStage = false;
  priceAtBuy = undefined;
  pauseSearch = false;
  stopAfterFirstTx = false;
  firstTxCaught = false;
  txObjects = [];
  retriesCompleted = 0;
  retryRounds = PARAMS.retryRounds;
  followed = null;
  purchaseTokenBalance = null;
};

console.log();

let continuousBuyExecute;
let globalFailed = 0;
const pushTxObject = async (round, txObj) => {
  txObjects.push([round, txObj]);

  let txLength = txObjects.length;
  if (txObjects.length != roundsToBuy) return;

  // When all the rounds have been completed, check their statuses, if any have failed, purge from object
  Log("Fetching transaction data for all rounds...");
  let failed = globalFailed;
  globalFailed = 0;

  txObjects.forEach(async ([round, tx], idx) => {
    if (tx != "EXECUTED") {
      if (await getTxFailStatus(tx, provider, round, Log)) {
        failed += 1;
        txObjects = txObjects.filter((_, _idx) => {
          return _idx != idx;
        });
      }
    }

    // If last tx is not being checked, keep checking
    if (idx != txLength - 1) return;

    if (failed > 0) {
      Log(`${failed} transaction(s) failed!`);
      if (retriesCompleted != retryRounds) {
        if (!mode.includes("Instant") && !mode.includes("Approve")) {
          if (lastGasPrice) {
            if (lastOut.IS_EIP1559) {
              lastOut;
              lastOut.maxPriorityFeePerGas = ethers.BigNumber.from(
                Math.ceil(Number(priorityGas) * PARAMS.gasMultiplier)
              );
            } else
              lastOut.gasPrice = ethers.BigNumber.from(
                Math.ceil(Number(realBuyGas) * PARAMS.gasMultiplier)
              );
          }

          txObjects = [];
          await updateBuyTx(0);

          Log(
            `Starting buys for ${failed} failed rounds with ${
              delayBetweenBuys / 1000
            }s delay between rounds after ${retryDelay / 1000}s.`
          );
          if (lastGasPrice) {
            if (lastOut.gasPrice)
              Log(
                `New gasPrice: ${ethers.utils.formatUnits(
                  lastOut.gasPrice,
                  9
                )} GWEI`
              );
            if (lastOut.maxPriorityFeePerGas)
              Log(
                `New maxPriorityFeePerGas: ${ethers.utils.formatUnits(
                  lastOut.maxPriorityFeePerGas,
                  9
                )} GWEI`
              );
          }
          setTimeout(
            () => continuousBuyExecute(lastOut, failed, delayBetweenBuys, 0),
            retryDelay
          );
          retriesCompleted++;
        }
      } else {
        Log("All retries exhausted!");
        if (PARAMS.stopAfterFirstTx) process.exit();
        else {
          resetForAutoMagic();
        }
      }
    } else {
      Log("Transaction(s) SUCCESSFUL!");
      if (
        PARAMS.antiRugPull ||
        PARAMS.sellOnPercentageGain ||
        PARAMS.sellApprove
      ) {
        inSecondStage = true;
        await executeApprove(
          PARAMS.privatekeys,
          purchaseToken.address,
          buyBot.address
        );
        await updateSecondStageTx();
      }
      if (PARAMS.antiRugPull) {
        detectRugPullNowOn = true;
      }

      if (mode == "Follow Wallets") detectFollowSellNowOn = true;

      if (sellOnPercentageGain) {
        detectGainsNowOn = true;
        Log("Fetching current price...");
        priceAtBuy = (
          await router.getAmountsOut(
            ethers.utils.parseUnits("1", await purchaseToken.decimals()),
            [purchaseToken.address, liquidityToken.address]
          )
        )[1];

        args.priceAtBuy = priceAtBuy;
        Log(
          "Price at buy is:",
          ethers.utils.formatUnits(priceAtBuy, await liquidityToken.decimals()),
          await liquidityToken.symbol()
        );
        Log(
          `The bot will sell tokens once the price increases by ${
            sellOnPercentageGain / 100
          }%.`
        );
      }

      Log("Balances after Buy:");
      Log(
        `Contract ${WSYMB} balance:`,
        ethers.utils.formatEther(await WETH.balanceOf(buyBot.address))
      );
      purchaseTokenBalance = await purchaseToken.balanceOf(wallet.address);
      args.purchaseTokenBalance = purchaseTokenBalance;
      Log(
        `${await purchaseToken.symbol()} balance:`,
        ethers.utils.formatUnits(
          await purchaseToken.balanceOf(wallet.address),
          await purchaseToken.decimals()
        )
      );
      if (stopAfterFirstTx && !PARAMS.antiRugPull && !sellOnPercentageGain)
        process.exit(0);
      else roundsToBuy = PARAMS.roundsToBuy;
      pauseSearch = false;
    }
  });
  return txObjects.length;
};

const main = async () => {
  Log("Transaction:", await provider.getTransactionCount(wallet.address));
  Log(
    "Balance:",
    ethers.utils.formatEther(await provider.getBalance(wallet.address)),
    WSYMB.slice(1)
  );
  Log(
    "Contract balance:",
    ethers.utils.formatEther(await WETH.balanceOf(buyBot.address)),
    WSYMB,
    "\n"
  );

  autoMagicLiquidityTokens = await formatLiquidityTokenParams(
    autoMagicLiquidityTokens
  );
  if (!["Follow Wallets", "Auto-Magic"].includes(mode)) {
    ({ liquidityToken, minimumLiquidity, maximumLiquidity } =
      await updateLiquidityToken(
        PARAMS.liquidityToken,
        PARAMS.minimumLiquidity,
        0
      ));
  }

  if (PARAMS.preApprove) {
    // TODO NOT TESTED
    switch (mode) {
      case "Instant Sell": {
        await executeApprove(
          PARAMS.privatekeys,
          sellToken.address,
          buyBot.address
        );
        break;
      }
    }
  }

  if (!["Auto-Magic", "Instant Sell", "Follow Wallets"].includes(mode)) {
    ({ purchaseToken, tokenBuyAmount, realBuyMethod } =
      await updatePurchaseToken(
        PARAMS.purchaseToken,
        PARAMS.tokenBuyAmount,
        PARAMS.realBuyMethod
      ));
  }

  if (
    [
      "Fairlaunch",
      "Pinksale",
      "Follow Dev Wallet (MethodID)",
      "Instant Buy",
    ].includes(mode)
  )
    await updateBuyTx(0);

  if (["Instant Sell"].includes(mode)) {
    let sellPercentage = PARAMS.sellPercentage
      ? ethers.utils.parseEther(String(PARAMS.sellPercentage / 100))
      : 0;
    let sellAmount = PARAMS.sellAmount
      ? ethers.utils.parseUnits(
          String(PARAMS.sellAmount),
          await sellToken.decimals()
        )
      : 0;

    secondStageTx = await generateRugPullTx(
      buyBot,
      NETWORK_DATA.router,
      sellToken.address,
      liquidityToken.address,
      recipients,
      [sellPercentage, sellAmount]
    );
    stopAfterFirstTx = true;
  }

  if (mode == "Approve") {
    pauseSearch = true;
    let approveTo = PARAMS.approveTo;
    if (approveTo == "router") approveTo = router.address;
    else if (approveTo == "contract") approveTo = buyBot.address;

    await executeApprove(
      PARAMS.privatekeys,
      purchaseToken.address,
      approveTo,
      true
    );
  }

  const executeBuy = async (out, round) => {
    let txOptions = { gasLimit: PARAMS.gasLimit };
    if (PARAMS.autoGas == true) initTxGas(txOptions, out);
    else {
      console.log("OUT:", out);
      if (out.IS_EIP1559 || IS_EIP1559_AVAILABLE) {
        txOptions.maxPriorityFeePerGas = priorityGas;
      } else txOptions.gasPrice = realBuyGas;
    }
    
    if(PARAMS.USE_TokenDB == true){
      const state = await checkToken(out.purchaseToken);
      
      if(!state) return;
    }
    
    console.log("TX_OPT INIT:", txOptions);

    Log("Sending the transaction...");
    try {
      let tx = await wallet.sendTransaction(initTxGas(rawTx.tx, txOptions));
      Log("SENT BUY TRANSACTION:", constructTxUrl(tx));

      // TODO move to own
      let data = JSON.parse(String(fs.readFileSync(cachePath)));
      if (data.winnerNode == null || data.winnerNode == nodeID) {
        data.winnerNode = nodeID;
        fs.writeFileSync(cachePath, JSON.stringify(data));
        await pushTxObject(round, tx);
      }
    } catch (e) {
      getTxFailReasonLite(e);
      globalFailed += 1;
      await pushTxObject(round, "EXECUTED");
    }
  };
  
  const checkToken = async (address) => {
    console.log("checking... address:"+address);
    const checktoken =await TokenDB.filter((item)=> item.address === address);
    if(checktoken.length){
      let state = true;
      await checkList.map(async (row)=>{
        if(checktoken[0][row.key] != row.value){
          console.log("It's not verified : "+row.key+"=>"+checktoken[0][row.key]);
          state = false;
        }
      })
      
      if(state){
        console.log("It's verified");
        return true;
      }else 
        await resetForAutoMagic();
        return false;
    }else{
      console.log("called out.purchasetoken",address);
      await resetForAutoMagic();
      return false;
    }
  }

  const initTxGas = (tx, out) => {
    if (out.IS_EIP1559) {
      tx.maxFeePerGas = out.maxFeePerGas;
      tx.maxPriorityFeePerGas = out.maxPriorityFeePerGas;
    } else tx.gasPrice = out.gasPrice;
    tx.gasLimit = PARAMS.gasLimit;
    return tx;
  };

  const executeSell = async (out) => {
    let _rawTx = secondStageTx;
    _rawTx.gasLimit = PARAMS.gasLimit;
    if (out) _rawTx = initTxGas(secondStageTx, out);
    let tx = await wallet.sendTransaction(_rawTx);
    Log("SENT SELL TRANSACTION:", constructTxUrl(tx));
    await tx.wait();
    Log("Transaction SUCCESSFUL!");
    return tx;
  };
  _executeSell = executeSell;

  continuousBuyExecute = async (out, maxRounds, delay, round = 0) => {
    if (rawTx.round == round) await executeBuy(out, round);
    else {
      Log(rawTx, round);
      Log("Cached `round` does not match actual `round` Exiting...");
      process.exit(1);
    }
    round++;

    if (out.gasPrice) lastGasPrice = out.gasPrice;
    if (out.maxFeePerGas) lastGasPrice = out.maxFeePerGas;
    if (round != maxRounds) {
      setTimeout(
        () => continuousBuyExecute(out, maxRounds, delay, round),
        delay
      );
      await updateBuyTx(round);
    }
  };

  let sellRetries = 0;
  const checkCriteriaAndExecute = async (criteria, transaction) => {
    if (pauseSearch) return;
    let out = await criteria(transaction, args);
    if (!out || pauseSearch) return;
    pauseSearch = true;
    Log(out);

    firstTxCaught = true;
    let tokensChanged = false;
    if (out.hash) Log(`Triggered by: ${constructTxUrl(out)}`);
    if (out.followed) {
      followed = out.followed;
      args.followed = followed;
    }
    if (!liquidityToken.address && out.liquidityToken) {
      ({ liquidityToken, minimumLiquidity, maximumLiquidity } =
        await updateLiquidityToken(
          out.liquidityToken,
          PARAMS.minimumLiquidity,
          0
        ));
      args.liquidityTokenAddress = liquidityToken.address;
      tokensChanged = true;
    }
    if (out.purchaseToken && !purchaseToken.address) {
      ({ purchaseToken, tokenBuyAmount, realBuyMethod } =
        await updatePurchaseToken(
          out.purchaseToken,
          tokenBuyAmount,
          realBuyMethod
        ));
      args.purchaseTokenAddress = purchaseToken.address;
      tokensChanged = true;
    }
    if (tokensChanged) await updateBuyTx(0);
    if (out.devWalletAddress) {
      devWalletAddress = out.devWalletAddress;
      args.devWalletAddress = devWalletAddress;
    }

    if (PARAMS.blocksDelayBeforeFirstBuy > 0) {
      txByBlock[currentBlock + PARAMS.blocksDelayBeforeFirstBuy] = out;
      Log(
        "Buy scheduled for block",
        currentBlock + PARAMS.blocksDelayBeforeFirstBuy
      );
      return;
    }

    const gainDetected =
      detectGainsNowOn && out.gain && out.token != previousToken;
    const rugPullDetected = detectRugPullNowOn && out.rugPull;
    const followSellDetected = detectFollowSellNowOn && out.followSell;
    const devActionSell = out.devActionSell;
    if (
      gainDetected ||
      rugPullDetected ||
      followSellDetected ||
      devActionSell
    ) {
      try {
        if (mode == "Follow Dev Wallet (MethodID)") await updateSecondStageTx();

        if (rugPullDetected && mode != "Instant Sell")
          Log("RUG-PULL DETECTED:", constructTxUrl(out));
        if (followSellDetected)
          Log("SELL FROM FOLLOWED WALLET:", constructTxUrl(out));

        await executeSell(out);
        detectGainsNowOn = detectRugPullNowOn = detectFollowSellNowOn = false;
        if (PARAMS.stopAfterFirstTx) process.exit();
        previousToken = out.token;
        if (!["Instant Sell"].includes(mode)) resetForAutoMagic();
      } catch (e) {
        getTxFailReasonLite(e);
        if (sellRetries >= retryRounds) {
          Log("Sell retries exhausted! Exiting...");
          process.exit();
        } else sellRetries++;
        pauseSearch = false;
        if (["Instant Sell"].includes(mode)) {
          console.log("Sell failed!");
          process.exit();
        }
        Log("Listening for trigger...");
      }
    } else {
      Log(
        `Starting buys after ${waitBeforeFirstBuy / 1000}s with ${
          delayBetweenBuys / 1000
        }s delay between rounds for ${roundsToBuy} round(s)...`
      );

      lastOut = out;
      setTimeout(
        () => continuousBuyExecute(out, roundsToBuy, delayBetweenBuys, 0),
        waitBeforeFirstBuy
      );
    }
  };

  let instantDone = false;
  init = () => {
    provider.on("pending", async (tx) => {
      // Sync with master node
      let data = JSON.parse(String(fs.readFileSync(cachePath)));
      if (data.winnerNode != null && (data.winnerNode != nodeID || data.exit)) {
        Log("Exiting as commanded by master node...");
        process.exit(0);
      }
      if (pauseSearch || instantDone) return;
      let transaction = await provider.getTransaction(tx);
      if (!transaction) return;

      if (!args.init)
        args = {
          init: true,
          walletAddress: wallet.address,
          wallet,
          Log,
          ABI_SYMB,
          uniswapV2R2Decoder,
          wethAddress: WETH.address,
          routerAddress: NETWORK_DATA.router,
          useAutoMagicFor: PARAMS.useAutoMagicFor,
          purchaseTokenAddress: purchaseToken.address,
          autoMagicLiquidityTokens,
          liquidityTokenAddress: liquidityToken.address,
          devWalletAddress,
          devActionIds: PARAMS.devActionIds,
          devAction: PARAMS.devAction,
          devActionIgnoreIds: PARAMS.devActionIgnoreIds,
          toxicIds: PARAMS.toxicIds,
          nonToxicIds: PARAMS.nonToxicIds,
          listingIds: PARAMS.listingIds,
          minimumLiquidity,
          maximumLiquidity,
          gasAction: PARAMS.gasAction,
          gasMultiplier: required(PARAMS.gasMultiplier, "gasMultiplier"),
          router,
          sellOnPercentageGain,
          priceAtBuy,
          provider,
          followActionTokens: NETWORK_DATA.followActionTokens,
          followWallets: NETWORK_DATA.followWallets,
          followed: followed,
          followMaxGas,
          purchaseTokenBalance: purchaseTokenBalance,
          balanceCheckMultiplier,
          sellThresholdFall,
        };
      if (!IS_EIP1559_AVAILABLE && transaction && transaction.maxFeePerGas) {
        IS_EIP1559_AVAILABLE = true;
        Log("Turning on EIP-1559 Mode.");
      }

      if (
        stopAfterFirstTx &&
        firstTxCaught &&
        (!PARAMS.antiRugPull || !PARAMS.sellOnPercentageGain)
      )
        return;
      if (detectGainsNowOn || detectRugPullNowOn || detectFollowSellNowOn) {
        if (detectFollowSellNowOn)
          await checkCriteriaAndExecute(checkFollowWalletSell, transaction);
        if (PARAMS.antiRugPull && detectRugPullNowOn)
          await checkCriteriaAndExecute(checkRugPullTx, transaction);
        if (sellOnPercentageGain && detectGainsNowOn)
          await checkCriteriaAndExecute(checkPercentageGains, transaction);
      }

      if (!inSecondStage) {
        switch (mode) {
          case "Fairlaunch": {
            await checkCriteriaAndExecute(checkLiquidityAddTx, transaction);
            break;
          }
          case "Pinksale": {
            await checkCriteriaAndExecute(checkPinksale, transaction);
            break;
          }
          case "Follow Dev Wallet (MethodID)": {
            await checkCriteriaAndExecute(checkDevAction, transaction);
            break;
          }
          case "Auto-Magic": {
            await checkCriteriaAndExecute(checkAutoMagicTxV2, transaction);
            break;
          }
          case "Follow Wallets": {
            await checkCriteriaAndExecute(checkFollowWallet, transaction);
            break;
          }
          case "Instant Buy": {
            await checkCriteriaAndExecute(() => {
              return { valid: true };
            }, transaction);
            break;
          }
          case "Instant Sell": {
            detectRugPullNowOn = true;
            await checkCriteriaAndExecute(() => {
              return { valid: true, rugPull: true };
            }, transaction);
            break;
          }
        }
      }
    });

    provider.on("block", (blockNumber) => {
      currentBlock = blockNumber;
      if (txByBlock[blockNumber]) {
        Log("Executing scheduled buy at block", blockNumber, "...");
        continuousBuyExecute(
          txByBlock[blockNumber],
          roundsToBuy,
          delayBetweenBuys,
          0
        );
      }
    });

    provider._websocket.on("open", () => Log("Websocket listener started"));

    // provider._websocket.on("error", async (err) => {
    //   Log(`${err}: Unable to connect, retrying in 3s...`);
    //   setTimeout(init, 3000);
    // });
    provider._websocket.on("close", async (code) => {
      Log(`Connection lost with code ${code}! Attempting reconnect in 3s...`);
      // TODO fix exit on error
      provider._websocket.terminate();
      setTimeout(init, 3000);
    });
  };
  init();
};
main();
