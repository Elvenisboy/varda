const fs = require('fs')
const pb = require('protocol-buffers')
const appRoot = require('app-root-path')
const { values, random, isEqual } = require('lodash')
const multiaddr = require('multiaddr')
const PeerInfo = require('peer-info')
const peerId = require('peer-id')
const colors = require('colors')
const pull = require('pull-stream')

const pool = require('../../database/pool')
const Star = require('../star')
const { addStar } = require('../addStar')
const starProto = pb(fs.readFileSync(`${appRoot}/network/protos/star.proto`))
const config = require('../../config.json')
// const Pushable = require('pull-pushable')
// const push = Pushable()

const getLastMci = async () => {
  const client = await pool.acquire()
  try {
    const lastMci = client
      .prepare(
        'SELECT main_chain_index FROM stars ORDER BY main_chain_index DESC LIMIT 1'
      )
      .get().main_chain_index
    return lastMci
  } catch (error) {
    console.log(error)
  } finally {
    pool.release(client)
  }
}

const getDataFromPeers = conn => {
  return new Promise((resolve, reject) => {
    pull(
      conn,
      pull.map(data => {
        return data.toString('utf8')
      }),
      pull.collect((error, array) => {
        if (error) reject(error)
        resolve(array)
      })
    )
  })
}

const getLastMciFromPeers = () => {
  // two pub sub,计数器
  const count = []
  values(global.n.peerBook.getAll()).forEach(peer => {
    global.n.dialProtocol(peer, '/getLastMci', async (error, conn) => {
      if (error) console.log(error)
      let data = await getDataFromPeers(conn)
      count.push(data[0])
      // pull(
      //   conn,
      //   pull.map(data => {
      //     console.log('data is:', data)
      //     return data.toString('utf8')
      //   }),
      //   pull.drain(
      //     data => {
      //       count.push(data)
      //     },
      //     error => {
      //       console.log(error)
      //     }
      //   )
      // )
    })
  })
  console.log(count)
  // get the bigest
  const lastMci = Math.max(...count)

  return Promise.resolve(lastMci)
}

const buildStarsForSync = async index => {
  const client = await pool.acquire()
  try {
    let starHashList = client
      .prepare(`SELECT star FROM stars WHERE main_chain_index=${index}`)
      .all()

    if (starHashList.length == 0) {
      console.log(1)
      return []
    }

    const star = new Star()
    const stars = []
    starHashList.forEach(async v => {
      let aStar = await star.getStar(v.star)
      stars.push(aStar)
    })

    return await stars
  } catch (error) {
    console.log(error)
  } finally {
    pool.release(client)
  }
}

const getStarsFromPeer = (peer, startMci) => {
  let stars = []

  global.n.dialProtocol(peer, '/sync', (err, conn) => {
    if (err) console.log(err)
    pull(
      pull.values([`${startMCI}`]),
      conn,
      pull.map(data => {
        return starProto.star.encode(data)
      }),
      pull.drain(
        data => {
          // add it to database
          stars.push(data)
        },
        error => {
          console.log(error)
          return getStarsFromPeer(getAPeer(), startMci)
          //Change Another Peer to get Star
        }
      )
    )
  })
  return stars
}

const getAPeer = () => {
  const peers = values(global.n.peerBook.getAll())
  const index = random(peers.length)
  return peers[index]
}

const addStarFromPeer = star => {
  // vailidate
  addStar(star)
}

const sync = async mciFromPeers => {
  const startMci = await getLastMci()
  // const dValue = await getLastMciFromPeers() - lastMciInLocal
  // getAPeer is a mock function
  while (startMci < mciFromPeers) {
    if (parseInt(startMci) == 0) {
      startMci = 1
    }

    let peerA = getAPeer()
    let peerB = getAPeer()

    while (!isEqual(peerA, peerB)) {
      peerB = getAPeer()
    }

    let starsA = getStarsFromPeer(peerA, startMci)
    let starsB = getStarsFromPeer(peerB, startMci)

    const compare = isEqual(starsA, starsB)

    if (compare) {
      // add stars to database
      console.log('stars form peers: \n', starsA)
      for (let i = 0; i < starsA.length; i++) {
        addStarFromPeer(starsA[i])
      }
    } else {
      // get stars from bootstrap
      const bootstrap = config.bootstrap
      const peerIndex = random(bootstrap.length - 1)
      const addr = bootstrap[peerIndex]
      const ma = multiaddr(addr)
      const id = peerId.createFromB58String(ma.getPeerId())
      const peer = new PeerInfo(id)
      const stars = getStarsFromPeer(peer, startMci)
      console.log('stars form bootstrap: \n', stars)
      for (let i = 0; i < stars.length; i++) {
        addStarFromPeer(starsA[i])
        console.log(
          colors.green(`add star with index ${starsA[i].main_chain_index}`)
        )
      }
    }
    startMci++
  }
}

module.exports = { getLastMci, getLastMciFromPeers, buildStarsForSync, sync }
