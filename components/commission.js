/* this is a state machine
 * √ 1. vailidate balance should be biger than amount
 * √ 2. star author should be equal with transaction sender 
 * √ 3. star signature should be vailidate
 * √ 4. the same address should not appear in interval 6 main chain index
 * √ 5. a star should have at least one on star'main chain index - 1
 * √ 6. in one mci, the same should appear only once
 * √ if a star confirmed with 2/3 , broadcast this star to the network at once
 */

/* todao 
 * waiting pool 缺少一个内存清理工具
 * 当大于一时间时，清理掉waiting pool中broadcast = true的star
 */
const _ = require('lodash')

const pool = require('../database/pool')
const Vailidate = require('./vailidate')
const { addStar } = require('./addStar')
const emitter = require('./event')

const commissionNumber = 4

class Commission {
  constructor(node) {
    this.preparePool = new Proxy({}, this.prepare())
    this.waitingPool = new Proxy({}, this.waiting())
    this.node = node
  }

  prepare() {
    return {
      set: async (receiver, property, value) => {
        try {
          // if protobuf, decode it
          // 来自普通用户
          // 判断是否在waiting中
          if (_.has(receiver, property)) {
            return
          }
          // 遍历prepare pool，如果有在waiting pool中的， 忽略
          _.forOwn(receiver, (value, key) => {
            if ((_.has(this.waiting), key)) {
              _.omit(receiver, key)
            }
          })
          // 查库
          if (await this.haveStar(property)) {
            return
          }
          // vailidate, then add it
          const vailidateStar = await new Vailidate().vailidateStar(value)
          if (!vailidateStar) {
            return
          }

          // find mci
          const authorLastMci = await this._findLastMci(property.authorAdress)

          // a star should have at least one on star'main chain index - 1
          if (authorLastMci) {
            if (value.mci - lastMci < 6) {
              console.log(
                ` a star should have at least one on star'main chain index - 1`
              )
              return
            }
          }

          // 5. a star should have at least one on star'main chain index - 1
          const starsFromLastMci = await this._getStarHashByMci(value.mci - 1)
          // _.isArray(starsFromLastMci)
          const starHashesFromLastMci = starsFromLastMci.map(v => {
            return v.star
          })
          const includedStarFromLastMci = []

          value.parentStars.map(v => {
            if (starHashesFromLastMci.indexOf(v) !== -1) {
              includedStarFromLastMci.push(v)
            }
          })

          if (includedStarFromLastMci.length < 1) {
            return
          }
          // 6. in one mci, the same should appear only once
          const starsFromMci = await this._getStarHashByMci(property.mci)
          const authorsFromMci = starsFromMci.map(v => {
            return v.author_address
          })

          let authorAddressAppearTime = 0
          authorsFromMci.map(v => {
            if (property.authorAdress == v) {
              authorAddressAppearTime++
            }
          })

          if (authorAddressAppearTime >= 1) {
            return
          }
          //methods from above is vailidate, now vailidate is finished.

          // add it!
          receiver[property] = value
          // console.log(receiver)
          // emitter.emit('waitingStar', property)
          // 写一个递归，不断地从prepare pool取出Star广播并转向waiting pool
          this.waitingPool[property] = value
        } catch (error) {
          console.log(error)
        }
      }
    }
  }

  // todo:如果不是从本地来的star，要移除broadcast，count属性
  // todo:如果不是来自本地，需要验证消息发送者是不是来自议会成员，以及消息签名是否正确
  waiting() {
    return {
      set: async (receiver, property, value) => {
        // 0.验证
        console.log(0)
        console.log(receiver)
        if (!property || !value) {
          return
        }
        // if from local
        // if (value['starFrom'] && value['starFrom'] == 'local') {
        //   receiver[property] = value
        //   receiver[property].count = 0
        //   return
        // }

        if (!new Vailidate().vailidateStarWithoutTransaction(value)) {
          return
        }
        //1. 判断key（star hash）是否存在
        const existKey = _.has(receiver, property)
        //1.1存在：查看key中的count，若大于3/1则commit并广播(在receiver[property].broadcas不存在时)，不大于则继续计数
        if (existKey) {
          if (
            receiver[property].count >= Math.floor(commissionNumber / 3) * 2 &&
            !receiver[property].broadcast
          ) {
            //broadcast
            receiver[property].broadcast = true
            return
          }
          receiver[property].count++
          return
        }
        // 1.2 不存在：查看数据库中是否有，没有则添加
        if (!await this.haveStar(property)) {
          receiver[property] = value
          receiver[property].count = 0
        }
      }
    }
  }

  commit(star) {
    addStar(star)
  }

  haveStar(star_hash) {
    return pool.acquire().then(client => {
      if (
        client
          .prepare(`SELECT star FROM stars WHERE star='${star_hash}'`)
          .get() === undefined
      ) {
        pool.release(client)
        return false
      }

      pool.release(client)
      return true
    })
  }

  validate(star) {
    return new Vailidate().vailidateStar(star)
  }

  broadcast(node, from) {
    if (from == 'prepare') {
    }
    // else is from waiting
  }

  _findLastMci(author) {
    return pool.acquire().then(client => {
      const mci = client
        .prepare(
          `SELECT main_chain_index AS mci FROM stars WHERE author_address='${author}' ORDER BY main_chain_index ASC LIMIT 1`
        )
        .get()
      if (mci === undefined) {
        pool.release(client)
        return null
      }

      pool.release(client)
      return mci.mci
    })
  }

  _getStarHashByMci(mci) {
    return pool
      .acquire()
      .then(client => {
        const stars = client
          .prepare(`SELECT * FROM stars WHERE main_chain_index='${mci}'`)
          .all()
        pool.release(client)
        return Promise.resolve(stars)
      })
      .catch(error => {
        pool.release(client)
        return Promise.reject(error)
      })
  }
}

module.exports = Commission
// setImmediate(async () => {
//   let b = new Commission()
//   console.log(b.pool)
//   console.log(b.waiting)
//   const Star = require('./star')
//   let star = await new Star().getStar(
//     'd3e07MIoj95eJDV29gX3Ydyi6MkZI23MsWFuAsEk0XQ='
//   )
//   // star.starFrom = 'local'
//   b.waiting[star.star_hash] = star
//   console.log(b.waiting)
//   console.log(await b._findLastMci('VLRAJEAFXJBVYZQYT67YUQ3KJV53A'))
//   let stars = await b._getStarHashByMci(1)
//   console.log(
//     stars.map(v => {
//       return v.star
//     })
//   )
// })
// setImmediate(async () => {
//     let a = await b.validate('dYixChMfNFnkpGCyaqQLYjcpq2Cxw5RAhgfqh+jKKYA=')
//     console.log(a)
// })
// welcome to use Varda
// node has started (true/false): true
// listening on:
// /ip4/127.0.0.1/tcp/4002/ipfs/QmR8aEY1sWt6eq8pnT5BadV9maAfUawJrYBifDckWb3URz
// /ip4/172.17.0.2/tcp/4002/ipfs/QmR8aEY1sWt6eq8pnT5BadV9maAfUawJrYBifDckWb3URz
// /ip4/106.75.148.236/tcp/9090/ws/p2p-websocket-star/ipfs/QmR8aEY1sWt6eq8pnT5BadV9maAfUawJrYBifDckWb3URz
