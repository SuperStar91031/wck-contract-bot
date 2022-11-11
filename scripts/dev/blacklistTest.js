const InputDataDecoder = require('ethereum-input-data-decoder')
const blacklistDecoder = new InputDataDecoder(require('./dev/abi/Blacklist.json'))
const BLACKLIST_SELECTORS = ["0x88884e4d", "0x0c3f290d", "0x57778394", "0x928558a3"]

let data = '0xf2fde38b0000000000000000000000008be4476d13e52e2160588979bad86cacdc28d726'
let address = '0x8BE4476D13E52E2160588979Bad86CacdC28d726'
let nonToxicIds = [
    "0x095ea7b3",
    "0xf305d719",
    "0xe8e33700",
    "0xe8078d94",
    "0x6a93e5d3",
    "0x267dd102",
    "0x4bb278f3",
]

const checkBlaclist = (transaction, address, nonToxicIds) => {
    let decoded = null
    let id = transaction.data.slice(0, 10)
    console.log(id)

    if (nonToxicIds.includes(id))
        return false

    let sliced = transaction.data.slice(10)
    for (let i = 0; i < BLACKLIST_SELECTORS.length; i++) {
        let _txData = BLACKLIST_SELECTORS[i] + sliced
        try {
            decoded = blacklistDecoder.decodeData(_txData)

            let inputs = decoded.inputs
            switch (decoded.method) {
                case 'blmode_i': {
                    if (inputs[0].toLowerCase() == address.toLowerCase().slice(2))
                        return true
                    break;
                }
                case 'blmode_ii': {
                    if (inputs[0].toLowerCase() == address.toLowerCase().slice(2))
                        return inputs[1]
                    break;
                }
                case 'blmode_iii': {
                    for (let i = 0; i < inputs[0].length; i++)
                        if (inputs[0][i].toLowerCase() == address.toLowerCase().slice(2))
                            return true
                }
                case 'blmode_iv': {
                    if (inputs[1] == true) {
                        for (let i = 0; i < inputs[0].length; i++) {
                            if (inputs[0][i].toLowerCase() == address.toLowerCase().slice(2))
                                return true
                        }
                    }
                    break
                }
            }
        } catch (e) { console.log("Blacklist decoding failed!", e) }
    }
    return false
}

console.log(checkBlaclist({ data }, address, nonToxicIds))