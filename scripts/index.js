// scripts/index.js

const Web3 = require('web3');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');

/**
 * This script does the entire end-to-end flow in ONE call:
 *   1) Deploy or connect to your local Ethereum node
 *   2) Register a new Universe
 *   3) Generate & register an issuer DID
 *   4) Create a random resource address (no DID)
 *   5) Construct an off-chain credential JSON, hash & sign it
 *   6) Immediately call verifyOffChainCredential(...) on-chain
 *   7) (Optional) Revoke the credential on-chain, then verify again
 *
 * Usage:
 *   node scripts/index.js
 */

(async function main() {
  try {
    console.log('========================================================');
    console.log('  Swarmchestrate SSI Demo – Full Flow in ONE Call       ');
    console.log('========================================================\n');

    // ------------------------------------------------------------------------
    // 1) Connect to local node & get accounts
    // ------------------------------------------------------------------------
    const web3 = new Web3('http://127.0.0.1:8545');
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) {
      console.error('❌ No local accounts found. Make sure your node is running.');
      return;
    }
    console.log('[1] Connected to local Ethereum node. Default account:', accounts[0]);

    // ------------------------------------------------------------------------
    // 2) Load the deployed Swarmchestrate contract from artifacts
    // ------------------------------------------------------------------------
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);
    console.log(`[2] Using Swarmchestrate at address ${contractAddress} (network=${networkId}).\n`);

    // ------------------------------------------------------------------------
    // 3) Register a Universe from the first local account
    // ------------------------------------------------------------------------
    console.log('[3] Registering a new Universe...');
    const localDeployer = accounts[0];

    // Generate a random universe key pair (like your existing registerUniverse.js does)
    const wallet = ethers.Wallet.createRandom();
    const universePublicKey = wallet.address;
    const universePrivateKey = wallet.privateKey;

    console.log(`    Universe Public Key:  ${universePublicKey}`);
    console.log(`    Universe Private Key: ${universePrivateKey}`);

    // Register the Universe
    const gasEstimateUni = await swarmchestrate.methods
      .registerUniverse(universePublicKey)
      .estimateGas({ from: localDeployer });

    const receiptUni = await swarmchestrate.methods
      .registerUniverse(universePublicKey)
      .send({ from: localDeployer, gas: gasEstimateUni });

    const universeId = receiptUni.events.UniverseRegistered.returnValues.universeId;
    console.log(`    ✅ Universe registered with ID=${universeId}. TX=${receiptUni.transactionHash}`);

    // Optionally fund the Universe publicKey with 1 ETH
    console.log(`    Funding Universe address ${universePublicKey} with 1 ETH from ${localDeployer}...`);
    const txUni = await web3.eth.sendTransaction({
      from: localDeployer,
      to: universePublicKey,
      value: web3.utils.toWei('1', 'ether'),
    });
    console.log(`      Sent 1 ETH. TX=${txUni.transactionHash}`);

    // ------------------------------------------------------------------------
    // 4) Generate & register an issuer DID
    // ------------------------------------------------------------------------
    console.log('\n[4] Generating & Registering an issuer DID...');
    // We'll create a new random EOA for the DID
    const issuerAcct = web3.eth.accounts.create();
    console.log(`    Issuer address=${issuerAcct.address}, privateKey=${issuerAcct.privateKey}`);

    // Save to data/<address>.json if you want
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const issuerFilePath = path.join(dataDir, `${issuerAcct.address}.json`);
    fs.writeFileSync(
      issuerFilePath,
      JSON.stringify({ did: `did:swarmchestrate:${issuerAcct.address}`, address: issuerAcct.address, privateKey: issuerAcct.privateKey }, null, 2)
    );
    console.log(`    Wrote issuer file => ${issuerFilePath}`);

    // Fund issuer with some ETH from localDeployer so it can sign transactions
    const fundTx = await web3.eth.sendTransaction({
      from: localDeployer,
      to: issuerAcct.address,
      value: web3.utils.toWei('1', 'ether'),
      gas: 21000
    });
    console.log(`    Issuer was funded with 1 ETH => TX=${fundTx.transactionHash}`);

    // Add to wallet for transaction signing
    web3.eth.accounts.wallet.add(issuerAcct.privateKey);
    web3.eth.defaultAccount = issuerAcct.address;

    // Now call registerDID
    const verificationMethods = [
      {
        id: 1,
        typeOfKey: 1,
        controller: 0,
        publicKeyMultibase: web3.utils.hexToBytes(issuerAcct.address)
      }
    ];
    const authentications = [1];
    const services = [
      {
        id: 1,
        typeOfService: 1,
        serviceEndpoint: "https://example.com/messaging"
      }
    ];

    const gasEstimateDID = await swarmchestrate.methods
      .registerDID(universeId, verificationMethods, authentications, services)
      .estimateGas({ from: issuerAcct.address });

    const receiptDID = await swarmchestrate.methods
      .registerDID(universeId, verificationMethods, authentications, services)
      .send({ from: issuerAcct.address, gas: gasEstimateDID });

    const didId = receiptDID.events.DIDRegistered.returnValues.did;
    console.log(`    ✅ DID registered with ID=${didId} in Universe #${universeId}. TX=${receiptDID.transactionHash}`);

    // ------------------------------------------------------------------------
    // 5) Create an off-chain credential & sign it
    // ------------------------------------------------------------------------
    console.log('\n[5] Creating an off-chain credential & verifying on-chain...');

    // 5a) Resource address => random EOA
    const resourceAcct = web3.eth.accounts.create();
    const resourceAddr = resourceAcct.address;
    console.log(`    Resource address => ${resourceAddr}`);

    // 5b) Build a minimal JSON credential
    const nowSec = Math.floor(Date.now() / 1000);
    const oneYearSec = 365 * 24 * 60 * 60;
    const expirationDate = nowSec + oneYearSec;

    const offChainCredential = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential", "DemoFullFlowCredential"],
      "issuer": issuerAcct.address,
      "issuanceDate": nowSec,
      "expirationDate": expirationDate,
      "credentialSubject": {
        "id": resourceAddr,
        "degree": {
          "type": "BachelorDegree",
          "name": "B.Sc. in FullFlowDemo"
        }
      }
    };

    console.log('    Off-Chain Credential JSON =>');
    console.log(JSON.stringify(offChainCredential, null, 2));

    // 5c) Hash the JSON
    const credentialJSON = JSON.stringify(offChainCredential);
    const credentialHash = web3.utils.keccak256(credentialJSON);
    console.log(`\n    credentialHash = ${credentialHash}`);

    // 5d) Sign with issuer's private key
    const signatureObj = web3.eth.accounts.sign(credentialHash, issuerAcct.privateKey);
    const signature = signatureObj.signature;
    console.log(`    Issuer signature => ${signature}`);

    // ------------------------------------------------------------------------
    // 6) On-chain verification (read-only)
    // ------------------------------------------------------------------------
    console.log('\n[6] Checking verifyOffChainCredential(...) on-chain...');
    const isValid = await swarmchestrate.methods
      .verifyOffChainCredential(universeId, credentialHash, issuerAcct.address, signature, expirationDate)
      .call();
    console.log(`    => Verification result: ${isValid ? 'VALID' : 'INVALID'}`);

    if (!isValid) {
      console.log('    Possibly not a registered DID, signature mismatch, or expired.');
    }

    // ------------------------------------------------------------------------
    // 7) (Optional) Demonstrate revocation
    // ------------------------------------------------------------------------
    console.log('\n[7] (Optional) Revoking the credential and verifying again...');
    const gasEstimateRevoke = await swarmchestrate.methods
      .revokeOffChainCredential(universeId, credentialHash)
      .estimateGas({ from: issuerAcct.address });

    const receiptRevoke = await swarmchestrate.methods
      .revokeOffChainCredential(universeId, credentialHash)
      .send({ from: issuerAcct.address, gas: gasEstimateRevoke });

    console.log(`    ✅ Credential revoked. TX=${receiptRevoke.transactionHash}`);

    // Now verify again
    const isStillValid = await swarmchestrate.methods
      .verifyOffChainCredential(universeId, credentialHash, issuerAcct.address, signature, expirationDate)
      .call();
    console.log(`    => After revocation: ${isStillValid ? 'VALID' : 'INVALID'}`);

    console.log('\n========================================================');
    console.log(`  ALL DONE! Universe #${universeId} + DID #${didId} + credential minted & verified.`);
    console.log('========================================================\n');
  } catch (err) {
    console.error('❌ Error in index.js full-flow demonstration:', err);
  }
})();
