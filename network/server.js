const Server = require('./lib/server').default
const path = require('path')

console.info('starting RPC Service')
const server = new Server('0.0.0.0', 50051)
exports.run = () => server.autoRun(path.join(__dirname, './protosAndMethods'))
// exports.run = async () => { return Promise.resolve(server.autoRun(path.join(__dirname, './protosAndMethods'))) }
