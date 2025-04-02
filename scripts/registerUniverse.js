// scripts/registerUniverse.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Registers a new Universe in the Swarmchestrate contract.
 *  - Generates a random public/private key (this Universe will function as a top-level "system" on-chain).
 *  - Calls registerUniverse(publicKey) from the first local account (assumed to be the deployer).
 *  - Funds the new Universe publicKey with 1 ETH (for transaction signing, etc.).
 *  - Saves Universe data to data/<publicKey>.json for future usage.
 */
async function registerUniverse() {
  try {
    console.log('==============================================================');
    console.log('  Swarmchestrate – Registering a new Universe (Work Package)  ');
    console.log('==============================================================\n');

    const web3 = new Web3('http://127.0.0.1:8545');

    // 1) Get local accounts
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) {
      console.error('❌ No local accounts found. Make sure your Ethereum node is running.');
      return null;
    }

    // 2) Load contract from artifacts
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}.`);
      return null;
    }

    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);
    console.log(`[1] Found Swarmchestrate contract at ${contractAddress} (network ID=${networkId}).`);

    // 3) Generate a random Universe public/private key
    const wallet = ethers.Wallet.createRandom();
    const publicKey = wallet.address;
    const privateKey = wallet.privateKey;

    console.log('\n[2] Generated a new Universe key pair:');
    console.log(`    Universe Public Key:  ${publicKey}`);
    console.log(`    Universe Private Key: ${privateKey}`);

    console.log('\n[3] Registering Universe on-chain...');
    console.log(`    Caller (deployer) = ${accounts[0]}`);

    // 4) Register the Universe
    const gasEstimate = await swarmchestrate.methods
      .registerUniverse(publicKey)
      .estimateGas({ from: accounts[0] });

    const receipt = await swarmchestrate.methods
      .registerUniverse(publicKey)
      .send({ from: accounts[0], gas: gasEstimate });

    const universeId = receipt.events.UniverseRegistered.returnValues.universeId;
    console.log(`    ✅ Universe registered with ID=${universeId}.`);
    console.log(`       Transaction: ${receipt.transactionHash}`);

    // 5) Fund the Universe’s publicKey with 1 ETH
    console.log(`\n[4] Funding new Universe address ${publicKey} with 1 ETH from ${accounts[0]}...`);
    const tx = await web3.eth.sendTransaction({
      from: accounts[0],
      to: publicKey,
      value: web3.utils.toWei('1', 'ether'),
    });
    console.log(`    ✅ Sent 1 ETH. TX: ${tx.transactionHash}`);

    // 6) Save Universe data to data/<publicKey>.json
    const universeData = { address: publicKey, privateKey };
    const filePath = path.join(__dirname, `../data/${publicKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(universeData, null, 2));
    console.log(`\n[5] Universe data saved to ${filePath}.`);

    console.log('\n==============================================================');
    console.log('  Universe registration complete. You can now register DIDs,  ');
    console.log('  issue credentials, and cast votes under this Universe.       ');
    console.log('==============================================================\n');

    return { universeId, wallet };
  } catch (error) {
    console.error('❌ Error registering universe:', error);
    return null;
  }
}

module.exports = registerUniverse;

// Optional CLI usage:
//   node scripts/registerUniverse.js
if (require.main === module) {
  registerUniverse();
}
