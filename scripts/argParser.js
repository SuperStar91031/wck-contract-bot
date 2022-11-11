const arg = require('arg')
// Get CLI arguments
function parseArgumentsIntoOptions(rawArgs) {
    const args = arg(
        {
            '--index': Number,  // Mode selector
            '--node-id': Number,    // Node index
            '--run-id': Number  // Parent process ID, for syncing nodes 
        },
        {
            permissive: true,
            argv: rawArgs.slice(2),
        },
    )
    return {
        index: args['--index'],
        nodeID: args['--node-id'],
        runID: args['--run-id']
    }
}

const getCliArgs = () => {
    let cliArgs = parseArgumentsIntoOptions(process.argv)
    let index, nodeID
    if (!cliArgs.index) { throw "'missing required argument: --index'" } else cliArgs.index = cliArgs.index - 1
    if (!cliArgs.runID) { throw "'missing required argument: --run-id'" } else try { fs.mkdirSync(`./logs/${cliArgs.runID}`) } catch (e) { }
    if (!cliArgs.nodeID) { throw "'missing required argument: --node-id'" } else cliArgs.nodeID = cliArgs.nodeID - 1

    return cliArgs
}

module.exports = { getCliArgs }