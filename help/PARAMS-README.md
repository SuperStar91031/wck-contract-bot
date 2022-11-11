# README for Bot Parameters
**websockets**: List of websocket you would like to connect to. Use single url to use single-node mode.

**privatekeys**: Accounts where tokens are bought to. The first one acts as the primary private key as it sends all transactions (except approve ones, they are sent by each given).

**includeSender**: If tokens will be send to the transaction sender as well.

**preApprove**: Whether to approve token to router before sending tokens.

**sellApprove**: Use with Approve mode. Approves the sell token for selling.

**stopAfterFirstTx**: Whether to stop scanning after the first transaction has been caught.

**purchaseToken**: Address of the token to purchase.

**liquidityToken**: Address of the liquidity token. Leave empty for auto-detect.

**sellToken**: Address of the token to sell in `Instant Sell` mode.

**devWallet**: Address of the developer to track for desired transaction.

**methodIds**: A list of method IDs to target.

**realBuyMethod**: Desired way to buy the tokens:

0. Buy Exact Amount of Tokens
1. Buy Exact Amount of WETH

**tokenBuyAmount**: Amount of tokens to buy if realBuyMethod is 0.

**wethSellAmount**: Amount of WETH to sell if realBuyMethod is 1.

**minimumLiquidity**: Check if liquidity added is greater than this amount of liquiity token. Set to 0 for no effect.

**maximumLiquidity**: Rejects any token that has already more liquidity than the value set here. Set to 0.0 for sniping on new tokens. 

**antiRugPull**: Checks for rug-pull events, and sells all tokens if trigered.

**toxicIds**: A list of method IDs amounting to rug-pull. Use `null` to turn off, an empty array ([]) to get triggered on any dev-action, or specify specific method IDs to traget those only.

**nonToxicIds**: Acts as ignore list when toxicIds is [].

**sellOnPercentageGain**: Sells all purchase tokens automatically if the price on given router increases above the given percentage limit. Max 2 decimals. Use `null` to turn off.

**sellQuantityPercentage**: Percentage of bought tokens to sell (max 3 digits after decimals).

**sellAmount**: Amount of tokens to sell (used in case `sellPercentage` is set to null).

**sellForEth**: Whether the tokens will be sold for ETH instead of WETH.

**gasMultiplier**: Factor to increase gas by incase of a rug pull event.

**useChecks**: Whether to use checks for taxes and sellebility.

**checkSellebility**: Whether to check for sellebility (turning this off, will also disable checking for maxSellTax).

**wethForChecks**: Amount of WETH to use in buy transaction for checks.

**maxBuyTax**: Max buy tax, use null to ignore (in %).

**maxSellTax**: Max sell tax, use null to ignore (in %).

**autoGas**: If on, bot will automatically detect the target transaction gas and match it. on't disable for same block transactions, as it may cause frontrunning.

**gasLimit**: Gas limit to use for buy transaction, use as high value as possible to reduce `out of gas` risks.

**realBuyGas**: Gas price to use for buy transaction in case `autoGas` is turned off (in GWEI), and instantBuy if autoGas is off. Sets maxFeePerGas in case of EIP-1559 supporting networks.

**waitBeforeFirstBuy**: Wait time (in seconds) before first buy.

**blocksDelayBeforeFirstBuy**: Blocks delay before 1st transaction.

**roundsToBuy**: Number of rounds that the bot will execute the buy for.

**delayBetweenBuys**: Seconds delay between buy transactions.

**retryDelay**: Delay between getting info of failed transaction and restarting the buys.

**retryRounds**: Number of times the bot will retry.