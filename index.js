const fs = require('fs-extra')
const figlet = require('figlet')
const inquirer = require('inquirer')
const colors = require('colors')

const init = require('./first-start')

const start = async () => {
  try {
    await init()

    const p2pNetwork = require('./network/p2p')

    const HD = require('./components/hd-wallet')
    const config = require('./config.json')

    console.clear()

    console.log(
      colors.blue(
        figlet.textSync('Varda', {
          horizontalLayout: 'full'
        })
      )
    )

    const hd = new HD()

    const askForMnemonic = () => {
      const questions = [
        {
          name: 'mnemonic',
          type: 'password',
          message: 'Enter your wallet mnemonic:',
          validate: function(value) {
            if (value.length) {
              if (hd.validateMnemonic(value)) {
                return true
              }
              return 'mnemonic is wrong'
            } else {
              console.log(
                `\n Your mnemonic is here, please remember to backup it. \n ${hd.genMnemonic()}`
              )
              console.log(
                '\n mnemonic has been generated, the Varda will exit, input mnemonic next time'
              )
              return process.exit()
            }
          }
        },
        {
          name: 'password',
          type: 'password',
          message: 'Enter your mnemonic password (option):'
        }
      ]

      if (config.commission) {
        return inquirer.prompt(questions)
      }

      return Promise.resolve('welcome to use Varda')
    }

    const answer = await askForMnemonic()
    console.log(answer)
    const node = await p2pNetwork()
    console.log(node.pubsub)
  } catch (error) {
    console.log(error)
  }
}

start()
