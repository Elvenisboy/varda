const createKeccakHash = require('keccak')
const _ = require('lodash')

const Utils = require('./utils')
const utils = new Utils()

const Account = require('./account')

/** 
 * transaction type list:
 * 0 is genesis transaction
 * 1 is normal payment
 */
class Transaction {
    constructor() {
        this.payload_hash = null
        this.type = null
        this.sender = null
        this.amount = null
        this.recpient = null
        this.senderPublicKey = null
        // this.signature = null
        this.sk = null
    }

    toHash() {
        return createKeccakHash('sha3-256').update(this.type + this.sender + this.amount + this.recpient + this.senderPublicKey).digest('hex')
    }

    newTransaction(tx) {
        //_.assign faster than Object.assign
        _.assign(this, tx)
        this.payload_hash = this.toHash()
        let transaction = new Transaction()
        _.assign(transaction, this)
        return _.assign({}, transaction)
    }

    async check(tx) {
        //first check address and signature 
        // 1. get address and vailate address with pubkey
        // 2. get sig , use pubkey to vailate sig
        if (utils.genAddress(tx.senderPublicKey) !== tx.sender) {
            return false
        }

        const account = new Account(tx.sender)
        const checkTransaction = await account.checkTransaction(tx.amount)

        if (!checkTransaction) {
            return false
        }

        //secound check amount
        // 1.get amount
        // 2. if sender amount > his have, return false 
        return true
    }

}

module.exports = Transaction