const Account = require('./account')
const Transaction = require('./transaction')
const { prepareStar, broadcastStar } = require('./addStar')

const Utils = require('./utils')
const utils = new Utils()

class Wallet {
  async pay(recpient, amount, sk, data) {
    const tx = new Transaction()
    const pk = utils.getPub(sk)
    const address = utils.genAddress(pk)
    if (!data) {
      data = ''
    }
    const transaction = tx.newTransaction({
      type: 1,
      sender: address,
      amount: amount,
      recpient: recpient,
      senderPublicKey: pk,
      sk: sk,
      data: data
    })
    let star = await prepareStar(transaction)
    return star
  }
}

module.exports = Wallet
