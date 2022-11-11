const ethers = require("ethers");
const PARAMS = require("./params.json");
const _NETWORK_DATA = require("./networkData.json");
const NETWORK_DATA = _NETWORK_DATA[PARAMS.network];

const BUYBOT_ABI = ["function withdrawToken(address _token) external"];

const main = async () => {
  let provider = new ethers.providers.WebSocketProvider(
    NETWORK_DATA.websockets[0]
  );
  let BLOCK_EXPLORER_TX, WETH;

  console.log("Network:", PARAMS.network);
  BLOCK_EXPLORER_TX = `https://${NETWORK_DATA.explorer}/tx/`;
  WETH = NETWORK_DATA.wrapped;

  let wallet = new ethers.Wallet(PARAMS.privatekeys[0], provider);
  let contract = new ethers.Contract(NETWORK_DATA.contract, BUYBOT_ABI, wallet);

  try {
    let tx = await contract.withdrawToken(WETH);
    console.log(`${BLOCK_EXPLORER_TX}${tx.hash}`);

    await tx.wait();
    console.log("Withdraw successful!");
  } catch (e) {
    console.log("Withdraw failed!");
  }
  process.exit();
};

main();
