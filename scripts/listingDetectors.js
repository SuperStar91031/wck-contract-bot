const ethers = require("ethers");
const {
  ERC20_ABI,
  PINKSALE_FINALIZE_METHOD_ID,
  DXSALE_METHOD_ID,
  compareAddress,
} = require("./utils");

const liquidityAddDetect = async (transaction, args) => {
  const {
    ABI_SYMB,
    autoMagicLiquidityTokens,
    uniswapV2R2Decoder,
    wethAddress,
    router,
    provider,
    uniswapV2Factory,
  } = args;
  let out = {},
    decoded;
  try {
    decoded = uniswapV2R2Decoder.decodeData(transaction.data);
  } catch (e) {
    return null;
  }
  if (!decoded.method) return null;

  let inputs = decoded.inputs;
  if (!compareAddress(transaction.to, router.address)) return null;

  let liquidityTokenList = autoMagicLiquidityTokens.map((item) => {
    return item.token;
  });
  let index = undefined,
    liquidity = undefined;
  if (decoded.method === `addLiquidity${ABI_SYMB}`) {
    index = addressInList(wethAddress, liquidityTokenList);
    liquidity = ethers.BigNumber.from(inputs[3].toString());

    out.purchaseToken = inputs[0];
  } else if (decoded.method === "addLiquidity") {
    inputs[4] = ethers.BigNumber.from(inputs[4].toString());
    inputs[5] = ethers.BigNumber.from(inputs[5].toString());

    let ltis1 = addressInList(inputs[1], liquidityTokenList);
    let ltis0 = addressInList(inputs[0], liquidityTokenList);
    if (ltis1 != null) {
      index = ltis1;
      liquidity = inputs[5];
      out.purchaseToken = inputs[0];
    } else if (ltis0 != null) {
      index = ltis0;
      liquidity = inputs[4];
      out.purchaseToken = inputs[1];
    } else return null;
  } else return null;

  if (liquidity.lt(autoMagicLiquidityTokens[index].minimumLiquidity))
    return null;

  out.liquidityToken = autoMagicLiquidityTokens[index].token;

  let oneUnitToken = ethers.utils.parseUnits(
    "1",
    await new ethers.Contract(out.purchaseToken, ERC20_ABI, provider).decimals()
  );
  for (let i = 0; i <= liquidityTokenList.length; i++) {
    try {
      // CHECKS IF PAIR EXISTS
      await router.getAmountsOut(oneUnitToken, [
        out.purchaseToken,
        liquidityTokenList[i],
      ]);

      let liquidityToken = new ethers.Contract(
        liquidityTokenList[i],
        ERC20_ABI,
        provider
      );
      // GET LIQUIDITY AMOUNT
      const pairAddress = await uniswapV2Factory.getPair(
        out.purchaseToken,
        liquidityToken.address
      );
      let liquidityPresent = await liquidityToken.balanceOf(pairAddress);

      // CHECK IF LESS THAN MAXIMUM EXISTING LIQUIDITY
      let maxAllowedLiquidity = autoMagicLiquidityTokens[i].maximumLiquidity;
      if (liquidityPresent.gt(maxAllowedLiquidity)) return null;
    } catch (e) {
      continue;
    }
  }
  return out;
};

const listingIDDetect = async (transaction, args) => {
  const {
    router,
    autoMagicLiquidityTokens,
    listingIds,
    wallet,
    uniswapV2Factory,
  } = args;

  let out = {};

  let id = transaction.data.slice(0, 10);
  if (!listingIds.includes(id)) return null;

  let liquidityTokenList = autoMagicLiquidityTokens.map((item) => {
    return item.token;
  });

  let purchaseTokenAddress = transaction.to;
  // CHECK IF IT IS TOKEN CONTRACT
  let oneUnitToken = undefined;
  try {
    oneUnitToken = ethers.utils.parseUnits(
      "1",
      await new ethers.Contract(
        purchaseTokenAddress,
        ERC20_ABI,
        wallet
      ).decimals()
    );
  } catch (e) {
    return null;
  }
  if (liquidityTokenList.includes(purchaseTokenAddress)) return null;
  out.purchaseToken = purchaseTokenAddress;

  let maxLiquidityEncountered = ethers.BigNumber.from(0);
  for (let i = 0; i <= liquidityTokenList.length; i++) {
    try {
      // CHECKS IF PAIR EXISTS
      await router.getAmountsOut(oneUnitToken, [
        purchaseTokenAddress,
        liquidityTokenList[i],
      ]);

      let liquidityToken = new ethers.Contract(
        liquidityTokenList[i],
        ERC20_ABI,
        wallet
      );
      // GET LIQUIDITY AMOUNT
      const pairAddress = await uniswapV2Factory.getPair(
        out.purchaseToken,
        liquidityToken.address
      );
      let liquidityPresent = await liquidityToken.balanceOf(pairAddress);

      // CHECK IF LESS THAN MAXIMUM EXISTING LIQUIDITY
      let maxAllowedLiquidity = autoMagicLiquidityTokens[i].maximumLiquidity;
      if (liquidityPresent.gt(maxAllowedLiquidity)) return null;

      let liquidityRatio = liquidityPresent
        .mul(ethers.constants.WeiPerEther)
        .div(maxAllowedLiquidity);

      // ACCEPTS TOKEN WITH LIQUIDITY CLOSEST TO MAXIMUMLIQUIDITY AS LIQ TOKEN
      if (liquidityRatio.gt(maxLiquidityEncountered)) {
        maxLiquidityEncountered = liquidityRatio;
        out.liquidityToken = liquidityToken.address;
      } else continue;
    } catch (e) {
      continue;
    }
  }
  if (out.liquidityToken) return out;
};

const pinksaleDetect = async (transaction, args) => {
  let { provider, wethAddress } = args;

  let out = {};

  let id = transaction.data.slice(0, 10);
  if (id != PINKSALE_FINALIZE_METHOD_ID) return null;

  let _purchaseToken =
    "0x" + (await provider.getStorageAt(transaction.to, 9)).slice(26);
  let _liquidityToken =
    "0x" + (await provider.getStorageAt(transaction.to, 10)).slice(26);
  if (ethers.BigNumber.from(_liquidityToken).eq(0))
    _liquidityToken = wethAddress;

  out.purchaseToken = _purchaseToken;
  out.liquidityToken = _liquidityToken;

  return out;
};

const dxSaleDetect = async (transaction, args) => {
  let { provider, wethAddress } = args;

  let out = {};

  let id = transaction.data.slice(0, 10);
  if (id != DXSALE_METHOD_ID) return null;

  let _purchaseToken =
    "0x" + (await provider.getStorageAt(transaction.to, 0)).slice(26);
  out.purchaseToken = _purchaseToken;

  out.liquidityToken = wethAddress;

  return out;
};

const addressInList = (addr, list) => {
  for (let i = 0; i < list.length; i++)
    if (compareAddress(addr, list[i])) return i;
  return null;
};

module.exports = {
  liquidityAddDetect,
  listingIDDetect,
  pinksaleDetect,
  dxSaleDetect,
};
