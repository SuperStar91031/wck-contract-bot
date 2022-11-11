const readlineSync = require('readline-sync')
const { options } = require('./options')

index = readlineSync.keyInSelect(options, 'Please select an option:')
if (index >= 0)
    console.log(options[index] + ' mode selected.')

process.exit(index + 1)
