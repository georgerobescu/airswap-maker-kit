/*
 * A simple maker for the AirSwap Network
 * Warning: For demonstration purposes only, use at your own risk
 */
const express = require('express')
const winston = require('winston')
const ethers = require('ethers')
const cors = require('cors')
const bodyParser = require('body-parser')
const jayson = require('jayson')

const { orders, signatures } = require('@airswap/order-utils')
const swapDeploys = require('@airswap/swap/deploys.json')

// The token pairs we are serving quotes for and their trade prices
let tokenPairs = require('./pairs.json')

// Default expiry to three minutes
const DEFAULT_EXPIRY = 180

// Only issue unique nonces every ten seconds
const DEFAULT_NONCE_WINDOW = 10

// Server instance to start and stop
let server

// Logger instance
let logger

// The private key used to sign orders
let signerPrivateKey

// The Swap contract intended for settlement
let swapAddress

// A maximum amount to send. Could be determined dynamically by balance
let maxSignerParam = 1000

// Determine whether we're serving quotes for a given token pair
function isTradingPair({ signerToken, senderToken }) {
  return signerToken in tokenPairs && senderToken in tokenPairs[signerToken]
}

// Calculate the senderParam: An amount the taker will send us in a sell
function priceSell({ signerParam, signerToken, senderToken }) {
  return signerParam * tokenPairs[signerToken][senderToken]
}

// Calculate the signerParam: An amount we would send the taker in a buy
function priceBuy({ senderParam, senderToken, signerToken }) {
  return senderParam / tokenPairs[signerToken][senderToken]
}

// Create a quote object with the provided parameters
function createQuote({ signerToken, signerParam, senderToken, senderParam }) {
  return {
    signer: {
      token: signerToken,
      param: signerParam,
    },
    sender: {
      token: senderToken,
      param: senderParam,
    },
  }
}

// Create an order object with the provided parameters
async function createOrder({ signerToken, signerParam, senderWallet, senderToken, senderParam }) {
  order = await orders.getOrder({
    expiry: Math.round(new Date().getTime() / 1000) + DEFAULT_EXPIRY,
    nonce: Math.round(new Date().getTime() / 1000 / DEFAULT_NONCE_WINDOW),
    signer: {
      wallet: signerWallet,
      token: signerToken,
      param: signerParam,
    },
    sender: {
      wallet: senderWallet,
      token: senderToken,
      param: senderParam,
    },
  })
  // Generate an order signature
  order.signature = signatures.getPrivateKeySignature(order, signerPrivateKey, swapAddress)
  return order
}

// Peer API Implementation
const handlers = {
  getSenderSideQuote: function(params, callback) {
    callback(
      null,
      createQuote({
        senderParam: priceSell(params),
        ...params,
      })
    )
  },
  getSignerSideQuote: function(params, callback) {
    callback(
      null,
      createQuote({
        signerParam: priceBuy(params),
        ...params,
      })
    )
  },
  getMaxQuote: function(params, callback) {
    callback(
      null,
      createQuote({
        signerParam: maxSignerParam,
        senderParam: priceSell({ signerParam: maxSignerParam, ...params }),
        ...params,
      })
    )
  },
  getSenderSideOrder: async function(params, callback) {
    callback(
      null,
      await createOrder({
        senderParam: priceSell(params),
        ...params,
      })
    )
  },
  getSignerSideOrder: async function(params, callback) {
    callback(
      null,
      await createOrder({
        signerParam: priceBuy(params),
        ...params,
      })
    )
  },
}

// Web server instance
const app = express()

// CORS for connections from web browsers
app.use(
  cors({
    origin: '*',
    methods: 'POST',
  })
)

// POST body parsing for JSON-RPC
app.use(bodyParser.json())

// POST request handler
app.post(
  '/',
  jayson
    .server(handlers, {
      // Ensures we're serving requested token pairs and catches other errors
      router: function(method, params) {
        try {
          logger.info(`Received ${method} request`)
          if (isTradingPair(params)) {
            if (typeof this._methods[method] === 'object') return this._methods[method]
          } else {
            logger.warn(`Invalid ${method} request: Not serving token pair ${params.signerToken} ${params.senderToken}`)
            return new jayson.Method(function(params, callback) {
              callback({ code: -33601, message: 'Not serving quotes for this token pair' }, null)
            })
          }
        } catch (e) {
          return new jayson.Method(function(params, callback) {
            callback(true, null)
          })
        }
      },
    })
    .middleware()
)

// Starts the server instance
exports.start = function(_port, _address, _signerPrivateKey, _chainId, _logLevel) {
  signerPrivateKey = Buffer.from(_signerPrivateKey, 'hex')
  signerWallet = new ethers.Wallet(signerPrivateKey).address
  swapAddress = swapDeploys[_chainId]

  if (!swapAddress) {
    throw Error(`No Swap contract found for chain ID ${_chainId}.`)
  } else {
    // Specify the Swap contract to use
    orders.setVerifyingContract(swapAddress)

    // Setup logger
    logger = winston.createLogger({
      level: _logLevel,
      transports: [new winston.transports.Console()],
      format: winston.format.printf(({ level, message }) => {
        return `${level}: ${message}`
      }),
    })

    // Start server
    const port = _port || 8080
    server = app.listen(port, _address, () => {
      logger.info(`Server now listening. (${_address}:${port})`)
    })
  }
}

// Stops the server instance
exports.stop = function(callback) {
  if (server === undefined) {
    throw Error('Cannot stop; server is not running.')
  } else {
    server.close(callback)
  }
}
