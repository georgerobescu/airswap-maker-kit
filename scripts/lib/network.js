const dotenv = require('dotenv')
const ethers = require('ethers')
const prompt = require('prompt')
const chalk = require('chalk')
const os = require('os')

dotenv.config()

module.exports = {
  select: function(operation, callback) {
    const currentAccount = new ethers.Wallet(Buffer.from(process.env.ETHEREUM_ACCOUNT, 'hex')).address

    console.log(`\n${chalk.white.bold('AirSwap')}: ${chalk.white.bold(operation)}`)
    console.log(chalk.gray(`Current account ${currentAccount} ${chalk.green('Rinkeby')}\n`))

    selectedNetwork = 'rinkeby'
    signerPrivateKey = Buffer.from(process.env.ETHEREUM_ACCOUNT, 'hex')

    try {
      const provider = ethers.getDefaultProvider(selectedNetwork)
      const wallet = new ethers.Wallet(signerPrivateKey, provider)
      const publicAddress = wallet.address

      provider.getBalance(publicAddress).then(balance => {
        if (balance.eq(0)) {
          console.log(
            chalk.red('\n\nError ') +
              `The selected account (From .env: ${publicAddress}) must have some (${selectedNetwork}) ether to execute transactions.\n`
          )
          return
        }
        callback(wallet)
      })
    } catch (error) {
      console.log(`\n${chalk.yellow('Error')}: ${error.reason}`)
    }
  },
  getIPAddress: function() {
    const interfaces = os.networkInterfaces()
    for (let id in interfaces) {
      for (let i = 0; i < interfaces[id].length; i++) {
        if (interfaces[id][i].family === 'IPv4' && interfaces[id][i].address !== '127.0.0.1') {
          return interfaces[id][i].address
        }
      }
    }
  },
}
