//first, get last main chain index, and view how many stars in it

/* today is new year, so drink some bear～ happy new year every friends!!!!!
 *   at 2018.2.15 23:52
 */

// todo: Optimization sqlite query
const _ = require('lodash')
const fs = require('fs')
const appRoot = require('app-root-path');
const colors = require('colors')
const pb = require('protocol-buffers')
const pull = require('pull-stream')

const pool = require('../database/pool')
const Star = require('./star')
const aStar = new Star()
const genesis = aStar.getGenesis()
const Account = require('./account')

const Utils = require('./utils')
const utils = new Utils()
const starProto = pb(fs.readFileSync(`${appRoot}/network/protos/star.proto`))


function findUnLinked(client, index) {
    const unlinkedStars = []
    const stars = client.prepare(`SELECT * FROM stars WHERE main_chain_index=${index}`).all()
    stars.map(star => {
        const starHash = star.star
        const childrenCount = client.prepare(`SELECT COUNT(*) AS children FROM parenthoods WHERE parent_star='${starHash}'`).children
        if (childrenCount == 0) {
            unlinkedStars.push(starHash)
        }
    })
    return unlinkedStars
}

function findUnLinkedInFour(client) {
    const mciArray = []
    const lastMci = client.prepare('SELECT main_chain_index FROM stars ORDER BY main_chain_index DESC LIMIT 1').get().main_chain_index
    if (lastMci < 4) return mciArray
    for (let i = 1; i < 5; i++) {
        const unlinkedStars = findUnLinked(client, i)
        mciArray.concat(unlinkedStars)
    }
    return mciArray
}

function getSortedStars(client, index) {
    const stars = client.prepare(`SELECT star FROM stars WHERE main_chain_index=${index}`).all().map(star => {
        return star.star
    })
    sortedStars = _.sortBy(stars, (star) => {
        return star
    })
    return sortedStars
}

function getParents(client) {
    const lastMci = client.prepare('SELECT main_chain_index FROM stars ORDER BY main_chain_index DESC LIMIT 1').get().main_chain_index
    const starsOfMci = client.prepare(`SELECT * FROM stars WHERE main_chain_index=${lastMci}`).all()
    const intervalTime = Math.floor(Date.now() / 1000) - starsOfMci[0].timestamp

    if (starsOfMci.length == 1) {
        if (intervalTime > 10) {
            const parents = [starsOfMci[0].star, ...findUnLinkedInFour(client)]
            const move = 1
            console.log('1. parents:', parents)
            return {
                parents,
                move
            }
        } else {
            const index = lastMci - 1
            if (index == 0) {
                console.log('2.parents:', [genesis.star_hash])

                return {
                    parents: [genesis.star_hash],
                    move: 0
                }
            }

            const unlinkedStars = findUnLinked(client, index)

            if (unlinkedStars.length > 2) {
                console.log('3.parents:', [...unlinkedStars, ...findUnLinkedInFour(client)])

                return {
                    parents: [...unlinkedStars, ...findUnLinkedInFour(client)],
                    move: 0
                }
            }

            if (unlinkedStars.length == 1) {
                if (findUnLinkedInFour(client).length == 0) {
                    const stars = getSortedStars(client, index)
                    console.log('unlinkedStars', unlinkedStars)
                    console.log('4.parents:', [...unlinkedStars, stars[0]])

                    return {
                        parents: [...unlinkedStars, stars[0]],
                        move: 0
                    }
                } else {
                    console.log('5.parents:', [...unlinkedStars, ...findUnLinkedInFour(client)])

                    return {
                        parents: [...unlinkedStars, ...findUnLinkedInFour(client)],
                        move: 0
                    }
                }
            }

            // when count of unlinkedStars equal 0

            if (findUnLinkedInFour(client).length == 0) {
                const stars = getSortedStars(client, index)
                console.log('6.parents:', [...unlinkedStars, ...stars.slice(0, 2)])
                return {
                    parents: [...unlinkedStars, ...stars.slice(0, 2)],
                    move: 0
                }
            } else {
                const stars = getSortedStars(client, index)
                console.log('7.parents:', [...stars[0], ...findUnLinkedInFour(client)])
                return {
                    parents: [...stars[0], ...findUnLinkedInFour(client)],
                    move: 0
                }
            }

        }
    } else {
        if (intervalTime > 10) {
            const parents = [starsOfMci[0].star, ...findUnLinkedInFour(client)]
            const move = 1
            console.log('8.parents:', parents)
            return {
                parents,
                move
            }
        }

        if (starsOfMci.length < 10) {
            const unlinkedStars = findUnLinked(client, lastMci - 1)
            const starsInFour = findUnLinkedInFour(client)
            if (starsInFour.length == 0) {
                if (unlinkedStars.length == 1) {
                    console.log('9.parents:', [getSortedStars(client, lastMci - 1)[0], ...unlinkedStars])

                    return {
                        parents: [getSortedStars(client, lastMci - 1)[0], ...unlinkedStars],
                        move: 0
                    }
                }

                if (unlinkedStars.length > 2) {
                    console.log('10.parents:', unlinkedStars)

                    return {
                        parents: unlinkedStars,
                        move: 0
                    }
                }

                if (unlinkedStars.length == 0) {
                    console.log('11.parents:', getSortedStars(client, lastMci - 1).slice(0, 2))

                    return {
                        parents: getSortedStars(client, lastMci - 1).slice(0, 2),
                        move: 0
                    }
                }
            } else {
                if (1 < unlinkedStars.length < 2) {
                    console.log('12.parents', [...unlinkedStars, ...starsInFour])
                    return {
                        parents: [...unlinkedStars, ...starsInFour],
                        move: 0
                    }
                }

                if (unlinkedStars.length > 2) {
                    console.log('13.parents', [...unlinkedStars, ...starsInFour])

                    return {
                        parents: [...unlinkedStars, ...starsInFour],
                        move: 0
                    }
                }

                if (unlinkedStars.length == 0) {
                    console.log('14.parents:', [getSortedStars(client, lastMci - 1)[0], ...starsInFour])
                    return {
                        parents: [getSortedStars(client, lastMci - 1)[0], ...starsInFour],
                        move: 0
                    }
                }

            }
        } else if (starsOfMci.length == 10) {
            const unlinkedStars = findUnLinked(client, lastMci - 1)
            const starsInFour = findUnLinkedInFour(client)
            if (unlinkedStars.length == 0) {
                if (starsInFour.length == 0) {
                    return {
                        parents: getSortedStars(client, lastMci - 1).slice(0, 2),
                        move: 1
                    }
                }
                if (starsInFour.length > 0) {
                    return {
                        parents: [...getSortedStars(client, lastMci - 1).slice(0, 1), ...starsInFour],
                        move: 1
                    }
                }
            }
            if (unlinkedStars.length > 0 && unlinkedStars.length < 2) {
                if (starsInFour.length > 2) {
                    return {
                        parents: [...unlinkedStars, ...starsInFour],
                        move: 1
                    }
                } else {
                    return {
                        parents: [...unlinkedStars, ...getSortedStars(client, lastMci - 1).slice(0, 1), ...starsInFour],
                        move: 1
                    }
                }

            }
            if (unlinkedStars.length > 2) {
                return {
                    parents: [...unlinkedStars, ...starsInFour]
                }
            }
        }
    }

    // console.log()
    console.log(colors.red('==================================================================================='))
    console.log(colors.green('last mci: ') + lastMci)
    console.log(colors.green('stars of mci: \n') + starsOfMci)
    console.log(colors.green('间隔时间: \n') + intervalTime)


}

const prepareStar = (transaction) => {
    if (!transaction) return null

    return pool.acquire().then(async client => {
        const senderAddress = transaction.sender
        const account = new Account(senderAddress)
        const lastMci = client.prepare('SELECT main_chain_index FROM stars ORDER BY main_chain_index DESC LIMIT 1').get().main_chain_index

        const checkTransaction = await account.checkTransaction(transaction.amount)
        if (!checkTransaction) {
            return Promise.reject('amount bigger than balance')
        }

        const {
            parents,
            move
        } = getParents(client)
        const mci = lastMci + move

        const star = aStar.buildStar({
            timestamp: Math.floor(Date.now() / 1000),
            parentStars: parents,
            payload_hash: transaction.payload_hash,
            transaction: transaction,
            authorAddress: transaction.sender,
            mci: mci
        })

        return starProto.star.encode(star)
    })
}

const broadcastStar = (node, star) => {
    _.values(node.peerBook.getAll()).forEach((peer) => {
        node.dial(peer, '/sendStar', (err, conn) => {
            if (err) console.log(err)
            pull(
                pull.values([star]),
                conn
            )
        })
    })
}

const addStar = (star) => {
    return pool.acquire().then(async client => {
        const begin = client.prepare('BEGIN');
        const commit = client.prepare('COMMIT');
        const rollback = client.prepare('ROLLBACK');

        // const encodeStar = await prepareStar(transaction)
        // star = starProto.star.decode(star)
        const transaction = star.transaction

        begin.run()
        try {
            let addStar = client.prepare('INSERT INTO stars VALUES(@star, @main_chain_index, @timestamp, @payload_hash, @author_address, @signature)')

            addStar.run({
                star: star.star_hash,
                main_chain_index: star.mci,
                timestamp: star.timestamp,
                payload_hash: transaction.payload_hash,
                author_address: star.authorAddress,
                signature: star.signature
            })
            // transaction
            let addTransaction = client.prepare('INSERT INTO transactions VALUES (@star, @type, @sender, @amount, @recpient)')
            addTransaction.run({
                star: star.star_hash,
                type: transaction.type,
                sender: transaction.sender,
                amount: transaction.amount,
                recpient: transaction.recpient
            })
            // parenthood
            let addParenthood = client.prepare('INSERT INTO parenthoods VALUES (@child_star, @parent_star, @parent_index)')
            star.parentStars.map((parent, index) => {
                addParenthood.run({
                    child_star: star.star_hash,
                    parent_star: parent,
                    parent_index: index
                })
            })
            //account pk
            let findPk = client.prepare(`SELECT address FROM account_pks WHERE address='${transaction.sender}'`).get()
            if (findPk == undefined) {
                let addAccount = client.prepare('INSERT INTO account_pks VALUES (@address,@pk)')
                addAccount.run({
                    address: transaction.sender,
                    pk: transaction.senderPublicKey
                })
            }
            commit.run()
        } finally {
            if (client.inTransaction) {
                rollback.run()
                pool.release(client)
                return Promise.reject('error')
            };
            pool.release(client)
            return Promise.resolve('success')

        }
    }).catch(error => {
        return Promise.reject(error)
    })
}

const addStarFromBroadcast = (encodeStar) => {
    // 1. vailidate the message signature, the message should from commission

    // 2. vailidate the transaction signature
    return new Promise(async (resolve, reject) => {
        const star = starProto.star.decode(encodeStar)
        const transaction = star.transaction
        const checkSignature = utils.sigVerify(star.star_hash, star.signature, transaction.senderPublicKey)
        console.log(checkSignature)
        // 3. vailidate amount
        const account = new Account(transaction.sender)
        const checkTransaction = await account.checkTransaction(transaction.amount)
        console.log(checkTransaction)
        if (!checkTransaction) {
            reject('amount bigger than balance')
        }
        // 4. add star
        // addStar(star)
    })
}


/* this is a small test
let Tx = require('./transaction')
const tx = new Tx()

const sk = 'f9ec5ccb42e3c976a027a5ba74a0ed636b35d93bacde225dbe85aed8dfbb00b4f2e4942768671e46faf596f2bdf73c665a5a7c26e768eca1cf6935620e17d1ba'
const pk = 'f2e4942768671e46faf596f2bdf73c665a5a7c26e768eca1cf6935620e17d1ba'
const address = 'VLRAJEAFXJBVYZQYT67YUQ3KJV53A'

for (let i = 0; i < 1000; i++) {
    let newTx = tx.newTransaction({
        type: 0,
        sender: address,
        amount: 10 + i,
        recpient: 'VCRAJEAFXJBVYZQYT67YUQ3KJV53A',
        senderPublicKey: pk
    }, sk)
    addStar(newTx).then(console.log).catch(console.log)
}
*/
// setInterval(

//     () => {
//         let newTx = tx.newTransaction({
//             type: 0,
//             sender: address,
//             amount: 10,
//             recpient: 'VCRAJEAFXJBVYZQYT67YUQ3KJV53A',
//             senderPublicKey: pk
//         }, sk)
//         addStar(newTx).then(console.log).catch(console.log)
//     }, 2000
// )

let Tx = require('./transaction')
const tx = new Tx()

const sk = 'f9ec5ccb42e3c976a027a5ba74a0ed636b35d93bacde225dbe85aed8dfbb00b4f2e4942768671e46faf596f2bdf73c665a5a7c26e768eca1cf6935620e17d1ba'
const pk = 'f2e4942768671e46faf596f2bdf73c665a5a7c26e768eca1cf6935620e17d1ba'
const address = 'VLRAJEAFXJBVYZQYT67YUQ3KJV53A'
let newTx = tx.newTransaction({
    type: 0,
    sender: address,
    amount: 10,
    recpient: 'VCRAJEAFXJBVYZQYT67YUQ3KJV53A',
    senderPublicKey: pk,
    sk: sk
})
// console.log(newTx)

prepareStar(newTx).then(star => {
    console.log(star)
    // console.log(star.length)
    console.log(starProto.star.decode(star))
    // addStar(starProto.star.decode(star))
    // addStarFromBroadcast(star).catch(e => console.log(e))

}).catch(console.log)
module.exports = addStar