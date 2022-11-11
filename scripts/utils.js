const ethers = require("ethers");
const InputDataDecoder = require("ethereum-input-data-decoder");

let logger, BLOCK_EXPLORER_TX;
const initUtils = (_logger, _BLOCK_EXPLORER_TX) => {
  logger = _logger;
  BLOCK_EXPLORER_TX = _BLOCK_EXPLORER_TX;
};

const UNISWAPV2_ROUTER_ABI = [
  "function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external",
];
// Token to buy, ABI used for fetching decimals() data
const ERC20_ABI = [
  "function symbol() external view returns(string memory)",
  "function approve(address _spender, uint256 _value) public returns (bool success)",
  "function decimals() external view returns(uint8)",
  "function balanceOf(address user) external view returns(uint)",
  "function allowance(address owner, address spender) external view returns(uint)",
];

const UNISWAPV2_FACTORY_ABI = require("../abi/UniswapV2Factory.json");
const BUYBOT_ABI = require("../abi/BuyBot.json");

const BLACKLIST_DECODER = new InputDataDecoder(
  require("../abi/Blacklist.json")
);
const BLACKLIST_SELECTORS = [
  "0x88884e4d",
  "0x0c3f290d",
  "0x57778394",
  "0x928558a3",
];
const PINKSALE_FINALIZE_METHOD_ID = "0x4bb278f3";
const DXSALE_METHOD_ID = "0x267dd102";

function hex_to_ascii(hexStr) {
  let hex = hexStr.toString();
  let str = "";
  for (let n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
  }
  return str;
}

const assert = (condition, message) => {
  if (!condition) {
    console.log(message);
    process.exit(1);
  }
};

const assertLog = (condition, message) => {
  if (!condition) {
    logger(message);
    process.exit(1);
  }
};

const getAddressFromPARAM = (value, required = false) => {
  let address = value ? value.toLowerCase() : null;
  if (required && !address) throw "`address` parameter missing!";
  return address;
};

const compareAddress = (_addr1, _addr2) => {
  // if (!addr1 || _addr2) return false;
  const [addr1, addr2] = [_addr1, _addr2].map((addr) => {
    if (addr.slice(0, 2).toLowerCase() == "0x") addr = addr.slice(2);
    return addr.toLowerCase();
  });
  return addr1 == addr2;
};

const required = (value, name = "") => {
  let errorMsg = `REQUIRED: ${name === "" ? "<unnamed>" : name}`;
  if ([undefined, null, ""].includes(value)) throw errorMsg;
  else return value;
};

const formatMaxTaxes = (
  _maxTax,
  _acceptCondition,
  _useChecks,
  _name,
  logger
) => {
  let maxTax = ethers.constants.MaxUint256;
  if (!_useChecks) return maxTax;

  if (_acceptCondition) {
    maxTax = ethers.utils.parseEther(String(_maxTax)).div(100);
    logger(`Max ${_name} taxes set at ${_maxTax}%`);
  } else logger(`Ignoring ${_name} taxes.`);

  return maxTax;
};

const constructTxUrl = (tx) => {
  return `${BLOCK_EXPLORER_TX}${tx.hash}`;
};

async function reason(provider, tx) {
  let txData = await provider.getTransaction(tx.hash);
  let code = await provider.call(txData, tx.blockNumber);
  let reason = hex_to_ascii(code.substr(138));
  return reason;
}

const getBalanceOfTokenFmt = async (token_, address) => {
  return ethers.utils.formatUnits(
    await token_.balanceOf(address),
    await token_.decimals()
  );
};

const generateTID = (round) => {
  let TID = `${Date.now().toString().slice(0, -4)}${round}`;
  return TID;
};

const getTxFailStatus = async (tx, provider, round, logger) => {
  statusFetch: try {
    await tx.wait();
  } catch (e_wait) {
    try {
      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt) throw "Transaction hash not found!";
      } catch (e_retrieve) {
        logger(
          `Transaction at round ${round + 1}, ${
            tx.hash
          } not executed due to being slower in this round.`
        );
        return true;
        // break statusFetch;
      }
      let errReason = await reason(provider, tx);
      if (receipt.status != 1) throw `${errReason}`;
    } catch (e_rec) {
      let errorMsg;
      try {
        errorMsg = JSON.parse(e_rec.error.response).error.message;
      } catch (e) {
        errorMsg = e_rec;
      }
      logger(
        `Transaction at round ${round + 1}, ${tx.hash} failed due to:`,
        errorMsg
      );
      return true;
    }
  }
};

const getTxFailReasonLite = (e) => {
  logger("Transaction FAILED!");
  let message;
  try {
    message = JSON.parse(e.response).error.message;
  } catch (_) {}

  try {
    if (e.reason) logger("Failed to send transaction due to:", e.reason);
    if (e.reason == "replacement fee too low")
      logger(
        "This happens mostly due to this node sending the transaction just after another node, and the nonces not being updated that fast."
      );
    else if (message == "already known") {
      logger("Node was slower to send transaction!");
      process.exit();
    }
  } catch (_) {
    logger("(Exception) Failed to send transaction due to:", e);
  }
};
module.exports = {
  initUtils,
  UNISWAPV2_ROUTER_ABI,
  ERC20_ABI,
  UNISWAPV2_FACTORY_ABI,
  BUYBOT_ABI,
  BLACKLIST_DECODER,
  BLACKLIST_SELECTORS,
  PINKSALE_FINALIZE_METHOD_ID,
  DXSALE_METHOD_ID,
  getAddressFromPARAM,
  compareAddress,
  required,
  constructTxUrl,
  assert,
  assertLog,
  formatMaxTaxes,
  reason,
  getBalanceOfTokenFmt,
  generateTID,
  getTxFailReasonLite,
  getTxFailStatus,
};
