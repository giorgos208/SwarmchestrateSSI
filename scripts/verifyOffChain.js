// scripts/verifyOffChain.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const path = require('path');
const fs = require('fs');

/**
 * Usage:
 *   node verifyOffChain.js <universeId> <credentialHash> <issuerAddress> <signature> <expirationTimestamp>
 *
 * Example:
 *   node verifyOffChain.js 1 0x770f2cb7ebd2a06397c4b43809cf75663bb1711fb10e39dc53539a44ebe06d22 \
 *     0xb38418cF0f802fB4936B7B9c568C7E3912395E0e \
 *     0x1298bb5f63be14...a1c \
 *     1769116897
 *
 * The script will:
 *  - Connect to your local node
 *  - Load the Swarmchestrate contract
 *  - Call verifyOffChainCredential(...) read-only
 *  - Print "VALID" or "INVALID"
 *
 * Note: This is purely an on-chain read. No transaction or gas cost is needed
 *       since we use `call()` for verification.
 */

async function verifyOffChain() {
  try {
    console.log('========================================================');
    console.log('  Verifying Off-Chain Credential (On-Chain Read)        ');
    console.log('========================================================\n');

    const args = process.argv.slice(2);
    if (args.length < 5) {
      console.log(
        'Usage:\n  node verifyOffChain.js <universeId> <credentialHash> <issuerAddress> <signature> <expirationTimestamp>'
      );
      process.exit(1);
    }

    const universeId = parseInt(args[0], 10);
    const credentialHash = args[1];
    const issuerAddress = args[2];
    const signature = args[3];
    const expirationTimestamp = parseInt(args[4], 10);

    // 1) Connect to local Ethereum node
    const web3 = new Web3('http://127.0.0.1:8545');

    // 2) Load the deployed contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Universe ID:    ${universeId}`);
    console.log(`    credentialHash: ${credentialHash}`);
    console.log(`    issuerAddress:  ${issuerAddress}`);
    console.log(`    signature:      ${signature}`);
    console.log(`    expirationDate: ${expirationTimestamp}`);
    console.log('\n[2] Calling verifyOffChainCredential...');

    // 3) Make a read-only call
    const isValid = await swarmchestrate.methods
      .verifyOffChainCredential(
        universeId,
        credentialHash,
        issuerAddress,
        signature,
        expirationTimestamp
      )
      .call();

    console.log(`\n => On-chain verification result: ${isValid ? 'VALID' : 'INVALID'}`);

    console.log('\n========================================================');
    console.log('  Verification check complete.');
    console.log('========================================================\n');
  } catch (err) {
    console.error('❌ Error in verifyOffChain.js:', err);
  }
}

if (require.main === module) {
  verifyOffChain();
}

module.exports = verifyOffChain;
