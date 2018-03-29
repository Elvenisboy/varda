const os = require('os')
const fs = require('fs')
const appRoot = require('app-root-path')
const PeerInfo = require('peer-info')
const peerId = require('peer-id')
const pify = require('pify')
const rootPath = require('app-root-path')
const multiaddr = require('multiaddr')
const { values, pullAt } = require('lodash')
const pb = require('protocol-buffers')
const pull = require('pull-stream')
const ip = require('ip')
const publicIP = require('public-ip')
const colors = require('colors')
const _ = require('lodash')
const isIp = require('is-ip')
const Pushable = require('pull-pushable')
const push = Pushable()
const VARDA_HOME = process.env.VARDA_HOME || os.homedir() + '/.varda'
const config = require(`${rootPath}/config.json`)
const Node = require('./node-bundle')

const msg = pb(fs.readFileSync(`${appRoot}/network/protos/node.proto`))
const starProto = pb(fs.readFileSync(`${appRoot}/network/protos/star.proto`))

const Commission = require('../components/commission')
const commissions = require('../commissions.json')

const emitter = require('../components/event')

const Utils = require('../components/utils')
const utils = new Utils()
const pool = require('../database/pool')
const { addStarFromBroadcast } = require('../components/addStar')

const sync = require('../components/sync/sync')
/**
 * todo:
 * if local peer have a public ip, then broadcast this ip and peer id to the world
 * the net should have a public ip list, every 1 min send it to other peers
 */

const getPublicIp = async () => {
  try {
    if (config.enablePublicIp) {
      if (config.publicIp !== '' && isIp(config.publicIp)) {
        return config.publicIp
      } else {
        return await publicIP.v4()
      }
    }
    return null
  } catch (error) {
    return null
  }
}

const encodePublicIps = publicIps => {
  const buf = msg.addrs.encode({
    addrs: publicIps
  })
  return buf
}

const createNode = async () => {
  const privateKey = require(VARDA_HOME + '/keys.json').PrivateKey

  return pify(peerId.createFromPrivKey)(privateKey) // peerid
    .then(id => {
      return new PeerInfo(id)
    }) // peerInfo
    .then(async peerInfo => {
      let peerPublicIP = await getPublicIp()

      if (!peerPublicIP) {
        if (config.signal) {
          console.log(`using config.signal ${config.signal}`)
          let ma = multiaddr(config.signal)
          peerInfo.multiaddrs.add(ma)
        }
      }

      let addr = `/ip4/0.0.0.0/tcp/${config.Port}`
      let ma = multiaddr(addr)
      peerInfo.multiaddrs.add(ma)

      return peerInfo
    })
    .then(peerInfo => {
      return new Node(peerInfo, config)
    })
}

const runP2p = async sk => {
  let publicIpsList = []

  let node = await createNode()

  let start = () => {
    return new Promise((reslove, reject) => {
      node.start(error => {
        if (error) reject(error)
        reslove()
      })
    })
  }

  return start().then(async () => {
    console.log('node has started (true/false):', node.isStarted())
    console.log('listening on:')
    node.peerInfo.multiaddrs.forEach(ma => console.log(ma.toString()))

    // when discovery a peer, try to dialProtocol to this peer,if it can reply,
    // peers will connect with each other
    node.on('peer:discovery', peerInfo => {
      node.dialProtocol(peerInfo, (err, conn) => {
        if (err) console.log(err)
      })
    })

    // when connect a peer, send own public ip to it
    node.on('peer:connect', peerInfo => {
      const idStr = peerInfo.id.toB58String()
      console.log(colors.green('Connected: ') + idStr)
    })

    node.on('peer:disconnect', peerInfo => {
      node.hangUp(peerInfo, error => {
        if (error) console.log(error)
      })
      console.log(colors.gray('Disconnect:'), peerInfo.id.toB58String())
    })

    let peerPublicIp = await getPublicIp()

    // Handler:
    node.handle('/getPubIpAddr', (protocol, conn) => {
      pull(
        conn,
        pull.map(ip => {
          try {
            return msg.addr.decode(ip)
          } catch (error) {
            console.log('receive a wrong protobuf')
          }
        }),
        pull.collect((err, array) => {
          if (err) console.log(err)
          try {
            if (publicIpsList.indexOf(array[0].addr) == -1) {
              // console.log('push', array[0].addr)
              publicIpsList.push(array[0].addr)
              const ma = multiaddr(array[0].addr)
              // console.log(ma)
              const id = peerId.createFromB58String(ma.getPeerId())
              let peer = new PeerInfo(id)
              peer.multiaddrs.add(ma)
              node.dial(peer, (err, conn) => {
                if (err) {
                  _.remove(publicIpsList, n => {
                    return n == array[0].addr
                  })
                }
              })
            }
          } catch (error) {
            console.log('addr is wrong')
          }
        })
      )
    })

    node.handle('/peerListSync', async (protocol, conn) => {
      pull(
        conn,
        pull.map(v => {
          try {
            return msg.addrs.decode(v)
          } catch (error) {
            console.log(error)
          }
        }),
        pull.collect(function(err, array) {
          if (!_.isEmpty(array)) {
            // console.log(array[0])
            let list = array[0].addrs
            list.forEach(value => {
              // console.log(value)
              const ma = multiaddr(value)
              const id = peerId.createFromB58String(ma.getPeerId())
              let p = new PeerInfo(id)
              p.multiaddrs.add(ma)

              node.dial(p, (err, conn) => {
                if (err) {
                  _.remove(publicIpsList, n => {
                    return n == value
                  })
                  console.log(err)
                }
              })
            })
          }
        })
      )
    })

    node.handle('/getLastMci', async (protocol, conn) => {
      // pull(push, conn)
      // push.push(`${lastMci}`)
      const lastMci = await sync.getLastMci()
      pull(pull.values([`${lastMci}`]), conn)
      console.log(`a peer wanna to get a last mci. and mci is ${lastMci}`)
    })

    node.handle('/sync', async (protocol, conn) => {
      const data = await sync.getDataFromPeers(conn)
      const startMci = data[0]
      console.log(`in sync protocol, startMci is ${startMci}`)
      let stars = await sync.buildStarsForSync(startMci)

      const encodeStars = starProto.stars.encode({
        stars: stars
      })
      console.log('I have prepare some stars：', encodeStars)
      console.log('and stars ：', stars)
      pull(pull.values([encodeStars]), conn)
    })
    // sendstar receive a unconfirm star, it should push to pool, to be confirm( for commissions) .

    if (peerPublicIp !== null) {
      let id = node.peerInfo.id.toB58String()
      let addr = `/ip4/${peerPublicIp}/tcp/${config.Port}/ipfs/${id}`
      const buf = msg.addr.encode({
        addr: addr
      })

      setInterval(() => {
        // console.log('broadcast Addr')
        values(node.peerBook.getAll()).forEach(peer => {
          node.dialProtocol(peer, '/getPubIpAddr', (err, conn) => {
            if (err) console.log(err)
            pull(pull.values([buf]), conn)
          })
        })
      }, 1000 * 30)
    }

    setInterval(() => {
      values(node.peerBook.getAll()).forEach(peer => {
        node.dialProtocol(peer, '/peerListSync', (err, conn) => {
          if (err) {
            console.log(err)
          }
          pull(pull.values([encodePublicIps(publicIpsList)]), conn)
        })
      })
    }, 1000 * 60)

    // For commissions:
    let commissionAddress
    let commission

    if (sk) {
      commissionAddress = utils.getAddressFromSk(sk)
      commission = new Commission(sk)
    }
    // address should in commissions list
    if (sk && commissions.indexOf(commissionAddress) !== -1) {
      // for commission
      node.pubsub.subscribe(
        'sendStar',
        msg => {
          try {
            const newStar = starProto.star.decode(
              Buffer.from(msg.data.toString(), 'hex')
            )
            commission.preparePool[newStar.star_hash] = newStar
          } catch (error) {
            console.log('receive a wrong protobuf')
            console.log(error)
          }
        },
        error => {
          if (error) {
            console.log(error)
          }
        }
      )

      // for commission
      //todo：验证commissionAddress是否在commissionList中
      node.pubsub.subscribe(
        'waitingStar',
        msg => {
          try {
            console.log(colors.green('waitingStar subscribe is working'))
            const tobeConfirm = starProto.commissionStar.decode(
              Buffer.from(msg.data.toString(), 'hex')
            )
            //判断是否是自己发出的
            const star = tobeConfirm.star

            if (commissions.indexOf(tobeConfirm.commissionAddress) == -1) {
              return
            }

            const verify = () => {
              const genAddress = utils.genAddress(
                tobeConfirm.commissionPublicKey
              )
              const addressVerify = genAddress == genAddress ? true : false

              if (!addressVerify) {
                return false
              }

              const sigVerify = utils.sigVerify(
                star.star_hash,
                tobeConfirm.commissionSignature,
                tobeConfirm.commissionPublicKey
              )

              if (!sigVerify || !addressVerify) {
                return false
              }

              return true
            }

            if (verify) {
              star.commissionAddress = tobeConfirm.commissionAddress
              commission.waitingPool[star.star_hash] = star
            }
          } catch (error) {
            console.log('receive a wrong protobuf')
            console.log(error)
          }
        },
        error => {
          if (error) {
            console.log(error)
          }
        }
      )
    }

    // todo: add a cache
    node.pubsub.subscribe(
      'commitStar',
      async msg => {
        try {
          const tobeCommit = starProto.commissionStar.decode(
            Buffer.from(msg.data.toString(), 'hex')
          )
          const star = tobeCommit.star

          const checkExist = pool.acquire().then(async client => {
            try {
              if (
                !client
                  .prepare(`SELECT * FROM stars WHERE star='${star.star_hash}'`)
                  .get()
              ) {
                return true
              }
              return false
            } catch (error) {
              console.log(error)
            } finally {
              pool.release(client)
            }
          })

          if (await checkExist) {
            await addStarFromBroadcast(star)
            console.log(colors.green('add success'))
          }

          // first fin star in cache, if not have, add it to db
        } catch (error) {
          console.log('receive a wrong protobuf')
          console.log(error)
        }
      },
      error => {
        if (error) {
          console.log(error)
        }
      }
    )

    global.n = node

    const { getLastMciFromPeers } = require('../components/sync/sync')
    getLastMciFromPeers()

    return node
  })
}

module.exports = runP2p
