const ethers = require("ethers");
const { compareAddress } = require("./utils");

// TODO add maximumLiqudiity param
const swapForTokenDetect = async (transaction, args) => {
  const { ABI_SYMB, followActionTokens, uniswapV2R2Decoder, routerAddress } =
    args;

  let decoded;
  try {
    decoded = uniswapV2R2Decoder.decodeData(transaction.data);
  } catch (e) {
    return null;
  }
  let inputs = decoded.inputs;
  if (!compareAddress(transaction.to, routerAddress)) return null;
  console.log("Above if SD");

  let path;
  if (
    [
      `swapExact${ABI_SYMB}ForTokens`,
      `swap${ABI_SYMB}ForExactTokens`,
      `swapExact${ABI_SYMB}ForTokensSupportingFeeOnTransferTokens`,
    ].includes(decoded.method)
  ) {
    path = inputs[1];
  } else if (
    [
      "swapExactTokensForTokens",
      "swapTokensForExactTokens",
      "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    ].includes(decoded.method)
  ) {
    path = inputs[2];
  } else return null;

  let a = getTokensForOut(path, followActionTokens);
  console.log(a);
  return a;
};

const getTokensForOut = (path, liquidityTokens) => {
  console.log(path, liquidityTokens);
  if (!path) return null;
  if (!addressInList(path[path.length - 1], liquidityTokens)) {
    let out = {};
    out.purchaseToken = path[path.length - 1];
    out.liquidityToken = path[path.length - 2];
    return out;
  }
  return null;
};

const addressInList = (addr, list) => {
  for (let i = 0; i < list.length; i++)
    if (compareAddress(addr, list[i])) return i;
  return null;
};

module.exports = {
  swapForTokenDetect,
};
