const bip39 = require('bip39')
const hd = require('ed25519-hd-key')
const {
  derivePath,
  getMasterKeyFromSeed,
  getPublicKey
} = require('ed25519-hd-key')
const _ = require('lodash')

const Utils = require('./utils')
const utils = new Utils()

class HDWallet {
  constructor() {
    this.seed = null
  }

  fromMnemonic(mnemonic, password = undefined) {
    return (this.seed = this.getSeed(mnemonic, password))
  }

  fromSeed(seed) {
    if (!_.isString(seed)) {
      throw new TypeError('seed should be a hex string')
    }
    return (this.seed = seed)
  }

  genMnemonic({ bits = 256, language = 'english', rng = undefined } = {}) {
    // if you wanna get a 12 mnemonic word, you ca set bits with 128
    if (language && !bip39.wordlists.hasOwnProperty(language)) {
      throw new TypeError('Language should be include in bip39 wordlist')
    }

    return bip39.generateMnemonic(bits, rng, bip39.wordlists[language])
  }

  getSeed(mnemonic, password = undefined) {
    return bip39.mnemonicToSeedHex(mnemonic, password)
  }

  genKeypair(index, seed) {
    const path = `m/44'/233'/${index}'`
    seed = seed ? seed : this.seed
    const key = derivePath(path, seed).key
    const keys = utils.fromSeed(new Uint8Array(key))

    return keys
  }
}

// let Hd = new HDWallet()
// // const seed = Hd.getSeed(Hd.genMnemonic())
// // const path = "m/44'/233'/0'"
// const m = Hd.genMnemonic()
// let w  =Hd.fromMnemonic(m)
// const keys = Hd.genKeypair( 1)
// console.log(keys)
