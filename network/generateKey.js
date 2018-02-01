const os = require('os')
const fs = require('fs-extra')
const peerId = require('peer-id')

const VARDA_HOME = process.env.VARDA_HOME || os.homedir() + '/.varda'
const keyFile = VARDA_HOME + '/keys.json'

peerId.create({
    bits: 2048
}, (error, keys) => {
    if (error) {
        console.log(error)
    }
    const data = `{"PeerID": "${keys.toB58String()}", "PrivateKey": "${keys.privKey.bytes.toString('base64')}" }`
    fs.outputFile(keyFile, data).catch(error => console.log(error))
})