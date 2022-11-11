# WCK-Contract-Bot

## How to use?

1. Deploy the contract in `contracts/BuyBotUpdated.sol`. It takes address of the wrapped token on the network as parameter. Also fund the contract with some the network's native currency (eg. it will be AVAX/WAVAX on Avalanche and BNB/WBNB on BSC).
2. If the network's information doesn't exist in networkData.json, add it by making a new entry with the `CHAIN ID` of your network, and mentioning these values:

   a. explorer
   b. currency
   c. wrapped
   d. abi
   e. abitoken
   f. contract
   g. router

Follow given examples, to fill these. 3. Fill in `params.json`. You can look at `PARAMS-README.json` to understand how each of those work. Run "npm i" to download dependencies. (first installation) then run this command: `sudo apt install jq`. 4. Run the bot by running `bash multinode.sh`.

## Using the Multi-Node system

Mention more than one websockets in `params.json`.

## Using Mult-Wallet

Mention more than one private keys in `privatekeys` in `params.json`.

## Adding support for new networks:

The bot can support almost all EVM networks with a few tweaks. To add a new network, follow these steps:

1. Open `networkData.json`.
2. Here make an entry with the network ID as key, and add the following data fields:

   a. _explorer_: The address of the block explorer. Follow the same format as given already.

   b. _currency_: The native currency's symbol.

   c. _wrapped_: The address of the wrapped version of the native currency.

   d. _abi_: Use the Uniswap one used in existing ones for most networks, except for Avalanche, data of which is already filled. If the router uses a different ABI than those existing, then put the new `routerAbi.json` (you can use any name), inside the `scripts/dev/abi` folder and mention the path in the `abi` parameter.

   e. _abitoken_: The token symbol used in the ABI of the router. For example, if the router ABI mentions addLiquidityXYZ, then the abitoken is XYZ.

   f. _contract_: Address of the buybot contract deployed on the network.

   g. _router_: Router where the swaps should take place.

## Withdrawing Funds from contracts

1. Mention the contract's address in `networkData.json`.
2. Mention the private key that deployed the contract as the primary (first one in array) in `params.json`.
3. Run `node withdrawer.js`.

## What to do if you get GC error

Run `export NODE_OPTIONS="--max-old-space-size=8192"` in your terminal. This will reduce the probability of that error occuring.
