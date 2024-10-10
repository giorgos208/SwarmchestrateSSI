const Web3 = require('web3');
const DIDRegistry = require('../build/contracts/DIDRegistry.json');
const { ethers } = require('ethers');
const crypto = require('crypto');

async function registerDID(isResourceOwner = true) {  // Add a flag to specify ResourceOwner or Resource
  try {
    const web3 = new Web3('http://127.0.0.1:8545'); // Connect to Ganache

    const accounts = await web3.eth.getAccounts();
    if (accounts.length === 0) {
      console.error("No accounts found. Ensure that Ganache is running.");
      return;
    }

    const networkId = await web3.eth.net.getId();
    const deployedNetwork = DIDRegistry.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`DIDRegistry contract not deployed on network ID ${networkId}`);
      return;
    }

    const contractAddress = deployedNetwork.address;
    const didRegistry = new web3.eth.Contract(DIDRegistry.abi, contractAddress);

    // Generate a new wallet for the DID using ethers.js
    const wallet = ethers.Wallet.createRandom();
    const didString = `did:example:${wallet.address}`; // DID string
    const didBytes32 = web3.utils.soliditySha3(didString); // Convert DID to bytes32

    console.log(`DID: ${didString}`);
    console.log(`Public Key (Address): ${wallet.address}`);
    console.log(`Private Key: ${wallet.privateKey}`);

    // Register the DID: Call the correct function based on entity type (ResourceOwner/Resource)
    let receipt;
    if (isResourceOwner) {
      receipt = await didRegistry.methods
        .registerResourceOwner(didBytes32, wallet.address)  // Call registerResourceOwner for ResourceOwner
        .send({ from: accounts[0], gas: 300000 });
    } else {
      receipt = await didRegistry.methods
        .registerResource(didBytes32, wallet.address)  // Call registerResource for Resource
        .send({ from: accounts[0], gas: 300000 });
    }

    console.log(`DID ${didString} registered successfully. Tx: ${receipt.transactionHash}`);
    return { did: didString, wallet };
  } catch (error) {
    console.error("Error registering DID:", error.message);
    if (error.receipt) {
      console.error("Transaction Receipt:", error.receipt);
    }
    return null;
  }
}

module.exports = registerDID;
