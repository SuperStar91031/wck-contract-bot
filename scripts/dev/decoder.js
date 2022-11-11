// NOTE: ONLY FOR TESTING

const InputDataDecoder = require("ethereum-input-data-decoder");
const { ethers } = require("ethers");

// ABIs of contracts used
const BUYBOT_ABI = require("../../abi/BuyBot.json");

const decoder = new InputDataDecoder(BUYBOT_ABI);

let data =
  "0x541254c100000000000000000000000010ed43c718714eb63d5aa57b78b54704e256024e00000000000000000000000055d398326f99059ff775485246999027b3197955000000000000000000000000e9e7cea3dedca5984780bafc599bd69add087d560000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000087f18c81dd0c970fbf574514cb8b601d6cd7f9a5";
let decoded = decoder.decodeData(data);
console.log(decoded);
console.log(decoded.inputs.map((elem) => elem.toString()));
