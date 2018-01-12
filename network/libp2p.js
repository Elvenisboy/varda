const os = require('os')
const PeerInfo = require('peer-info')
const peerId = require('peer-id')
const pify = require('pify')
const rootPath = require('app-root-path')
const multiaddr = require('multiaddr')
const VARDA_HOME = process.env.VARDA_HOME || os.homedir() + '/.varda'
const privateKey = require(VARDA_HOME + '/keys.json').PrivateKey
const config = require(`${rootPath}/config.json`)
const Node = require('./node-bundle')

const createNode = () => {
    return pify(peerId.createFromPrivKey)(privateKey) // peerid 
        .then(id => { return new PeerInfo(id) }) // peerInfo
        .then(peerInfo => {
            // peerInfo.multiaddrs.add(ma)}
            config.Swarm.forEach((addr) => {
                let ma = multiaddr(addr)
                peerInfo.multiaddrs.add(ma) //add multiaddr
            })
            return peerInfo
        })
        .then(peerInfo => { return new Node(peerInfo, config) })
}

setImmediate(async () => {
    let node = await createNode()
    node.start(() => {
        node.on('peer:discovery', (peerInfo) => {
            console.log('node has started (true/false):', node.isStarted())
            console.log('listening on:')
            node.peerInfo.multiaddrs.forEach((ma) => console.log(ma.toString()))
            console.log('Discovered a peer')
            const idStr = peerInfo.id.toB58String()
            console.log('Discovered: ' + idStr)
        })
    })
})