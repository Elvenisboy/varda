const Koa = require('koa')
const app = new Koa()
const appRoot = require('app-root-path')
const bodyparser = require('koa-bodyparser')
const json = require('koa-json')
var cors = require('koa2-cors')
const router = require('./routes')

const httpServer = node => {
  app.use(async (ctx, next) => {
    this.node = node
    await next()
  })

  app.use(cors())

  app.use(
    bodyparser({
      enableTypes: ['json']
    })
  )
  app.use(json())

  app.use(async (ctx, next) => {
    const start = new Date()
    await next()
    const ms = new Date() - start
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
  })

  app.use(router.routes(), router.allowedMethods())

  app.listen(3000)
  console.log('Http Server listening on port 3000')

  return Promise.resolve()
}

module.exports = httpServer
