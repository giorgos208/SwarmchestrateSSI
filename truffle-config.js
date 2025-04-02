const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config(); // Load environment variables from .env file

module.exports = {
  networks: {
    // Local Ganache development network
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "5777", // Set to a fixed network ID
    },
   
    // Sepolia test network
    sepolia: {
      provider: () => new HDWalletProvider({
        mnemonic: {
          phrase: process.env.MNEMONIC // Your mnemonic phrase
        },
        providerOrUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, // Alchemy URL
        pollingInterval: 15000,
        numberOfAddresses: 1,
        shareNonce: false,
      }),
      network_id: '11155111', // Sepolia network ID
      gas: 10000000,          // Gas limit
      gasPrice: 13000000000,  // Gas price in wei (13 Gwei)
      timeoutBlocks: 300,
      skipDryRun: true,
      confirmations: 2,       // # of confs to wait between deployments
    },
  },
  // Configure your compilers
  compilers: {
    solc: {
      version: "^0.8.20",     // Solidity version
      settings: {
        viaIR: true,
        optimizer: {
          enabled: true,
          runs: 200,         // Optimize for how many times you intend to run the code
        },
      },
    },
  },
  plugins: [
    'truffle-plugin-verify',  // Plugin for verifying contracts on Etherscan
  ],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY, // Your Etherscan API key
  },
};
