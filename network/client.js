const Client = require('./lib/client').default
const path = require('path')

const client = new Client('0.0.0.0', 50051)
client.autoRun(path.join(__dirname, './protosAndMethods'))

// so check peers state is easy. send message to peer, 
// if can't get reply, this peer is offlline
const checkServerState = () => {
    const meow = async () => {
        try {
            const reply = await client.invoke('peerState', 'PingPong', { 'message': 'ping' })
            console.log(reply.message)
            setTimeout(meow, 5000)
        } catch (error) {
            /*
            /* todo: delete peer information in database
            */
            return
            console.log(error)
        }
    }
    setImmediate(meow)
}

for (var i = 0; i < 1000; i++) {
    checkServerState()
}