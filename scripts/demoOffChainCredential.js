// scripts/demoOffChainCredential.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const fs = require('fs');
const path = require('path');

/**
 * Demonstrates:
 *   1) Generating a W3C-like credential off-chain.
 *   2) Hashing & signing it off-chain.
 *   3) Optionally verifying it on-chain (verifyOffChainCredential).
 *   4) Optionally revoking it on-chain (revokeOffChainCredential).
 *
 * Usage:
 *   node demoOffChainCredential.js <universeId> <issuerAddress> <subjectAddress>
 *
 * Example:
 *   node demoOffChainCredential.js 1 0xIssuerDID 0xResource
 */
async function demoOffChainCredential() {
  try {
    console.log('========================================================');
    console.log('  Off-Chain Credential Demo in Swarmchestrate           ');
    console.log('========================================================\n');

    // 1) Parse CLI args
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log('Usage: node demoOffChainCredential.js <universeId> <issuerAddress> <subjectAddress>');
      process.exit(1);
    }
    const universeId = parseInt(args[0], 10);
    const issuerAddress = args[1];
    const subjectAddress = args[2];

    // 2) Load the issuer account from data/<address>.json
    const issuerFilePath = path.join(__dirname, `../data/${issuerAddress}.json`);
    if (!fs.existsSync(issuerFilePath)) {
      console.error(`❌ Issuer account data not found: ${issuerFilePath}`);
      return;
    }
    const issuerAccount = JSON.parse(fs.readFileSync(issuerFilePath));

    // 3) Connect to local Ethereum node
    const web3 = new Web3('http://127.0.0.1:8545');
    web3.eth.accounts.wallet.add(issuerAccount.privateKey);
    web3.eth.defaultAccount = issuerAccount.address;

    // 4) Load the deployed Swarmchestrate contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`Universe ID = ${universeId}`);
    console.log(`Issuer DID Address = ${issuerAddress}`);
    console.log(`Subject Address = ${subjectAddress}\n`);

    // 5) Build an off-chain credential object
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    const expirationDate = nowInSeconds + oneYearInSeconds;

    const offChainCredential = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential", "ExampleDegreeCredential"],
      "issuer": issuerAddress,
      "issuanceDate": nowInSeconds,
      "expirationDate": expirationDate,
      "credentialSubject": {
        "id": subjectAddress,
        "degree": {
          "type": "BachelorDegree",
          "name": "Bachelor of Science in Demo"
        }
      }
    };

    console.log("Off-Chain Credential (JSON) =");
    console.log(JSON.stringify(offChainCredential, null, 2));

    // 6) Hash the entire JSON string
    const credentialJSON = JSON.stringify(offChainCredential);
    const credentialHash = web3.utils.keccak256(credentialJSON);
    console.log(`\nCredential Hash = ${credentialHash}`);

    // 7) Sign the hash with issuer's private key
    const signatureObj = web3.eth.accounts.sign(
      credentialHash,
      issuerAccount.privateKey
    );
    const signature = signatureObj.signature;
    console.log(`Issuer Signature = ${signature}`);

    // 8) Demonstrate on-chain verification
    console.log(`\n[Optional] Verifying off-chain credential on chain...`);
    // read-only call => no gas needed
    const isValid = await swarmchestrate.methods
      .verifyOffChainCredential(
        universeId,
        credentialHash,
        issuerAddress,
        signature,
        expirationDate
      )
      .call();

    console.log(` => On-chain verification result: ${isValid ? 'VALID' : 'INVALID'}`);

    if (!isValid) {
      console.log('Possibilities: issuer not a registered DID, signature mismatch, revoked, or expired.');
    }

    // 9) [Optional] Revoke the credential (uncomment if desired)
    /*
    console.log('\n[Optional] Revoking the credential on chain...');
    const gasEstimate = await swarmchestrate.methods
      .revokeOffChainCredential(universeId, credentialHash)
      .estimateGas({ from: issuerAccount.address });

    const revokeReceipt = await swarmchestrate.methods
      .revokeOffChainCredential(universeId, credentialHash)
      .send({ from: issuerAccount.address, gas: gasEstimate });

    console.log(`  => Credential revoked. TX: ${revokeReceipt.transactionHash}`);

    // Now verify again:
    const isStillValid = await swarmchestrate.methods
      .verifyOffChainCredential(
        universeId,
        credentialHash,
        issuerAddress,
        signature,
        expirationDate
      )
      .call();

    console.log(`  => Post-revocation, validity: ${isStillValid ? 'VALID' : 'INVALID'}`);
    */

    console.log('\n========================================================');
    console.log('  Off-chain credential demo complete.                   ');
    console.log('========================================================\n');

    return;
  } catch (err) {
    console.error('❌ Error in demoOffChainCredential:', err);
  }
}

// If called directly from CLI
if (require.main === module) {
  demoOffChainCredential();
}

module.exports = demoOffChainCredential;
