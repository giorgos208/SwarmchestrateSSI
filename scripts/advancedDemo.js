/*
 * scripts/advancedDemo.js
 */
const Web3 = require('web3');
const { ethers } = require('ethers');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');

const fs = require('fs');
const path = require('path');

/**
 * Demonstrates a "complex" scenario:
 *   1) Register a new Universe
 *   2) Generate & register multiple DID issuers (e.g., 2 or 3)
 *   3) For each DID, issue multiple off-chain credentials to random resources
 *   4) Verify those credentials on-chain
 *   5) Revoke one or two credentials (now stored in the DID's own revokedCredentials)
 *   6) Rate each DID with some 0..10 votes using the Universe’s publicKey
 *   7) Show final provider scores
 *
 * Usage:
 *   node advancedDemo.js
 * 
 * Make sure your local node is running and the contract is deployed.
 */
async function advancedDemo() {
  try {
    console.log('========================================================');
    console.log('  Swarmchestrate – Advanced Demo (Multiple DIDs, Credentials, Rating)  ');
    console.log('========================================================\n');

    // ----------------------------------------
    // 1) Connect to local node & load contract
    // ----------------------------------------
    const web3 = new Web3('http://127.0.0.1:8545');
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) {
      console.error('No accounts found. Check your local Ethereum node.');
      return;
    }

    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`Swarmchestrate contract not deployed on network ID ${networkId}.`);
      return;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Connected to local node, using deployer account=${accounts[0]}`);
    console.log(`    Contract at ${contractAddress} (network=${networkId}).\n`);

    // ----------------------------------------
    // 2) Register Universe
    // ----------------------------------------
    console.log('[2] Registering a new Universe...');
    const localDeployer = accounts[0];

    // Generate random Universe key pair
    const universeWallet = ethers.Wallet.createRandom();
    const universePublicKey = universeWallet.address;
    const universePrivateKey = universeWallet.privateKey;

    console.log(`    Universe public key => ${universePublicKey}`);
    console.log(`    Universe private key => ${universePrivateKey}`);

    // Register Universe
    const gasUni = await swarmchestrate.methods
      .registerUniverse(universePublicKey)
      .estimateGas({ from: localDeployer });

    const receiptUni = await swarmchestrate.methods
      .registerUniverse(universePublicKey)
      .send({ from: localDeployer, gas: gasUni });

    const universeId = receiptUni.events.UniverseRegistered.returnValues.universeId;
    console.log(`    => Universe #${universeId} created. TX=${receiptUni.transactionHash}`);

    // Fund Universe publicKey with 1 ETH
    const fundTx = await web3.eth.sendTransaction({
      from: localDeployer,
      to: universePublicKey,
      value: web3.utils.toWei('1', 'ether')
    });
    console.log(`    => Funded Universe with 1 ETH, TX=${fundTx.transactionHash}\n`);

    // Write Universe data
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const uniFilePath = path.join(dataDir, `${universePublicKey}.json`);
    fs.writeFileSync(
      uniFilePath,
      JSON.stringify({ address: universePublicKey, privateKey: universePrivateKey }, null, 2)
    );
    console.log(`    (Saved Universe data to ${uniFilePath})\n`);

    // ----------------------------------------
    // 3) Generate & register multiple DIDs
    // ----------------------------------------
    console.log('[3] Generating & registering multiple DID providers...');

    const DIDCount = 3;
    const didInfos = [];

    for (let i = 1; i <= DIDCount; i++) {
      // Create a random EOA for the DID provider
      const providerWallet = web3.eth.accounts.create();
      console.log(`   - DID provider #${i}: address=${providerWallet.address}`);

      // Save to data/<address>.json so we can load it later if needed
      const providerFile = path.join(dataDir, `${providerWallet.address}.json`);
      const providerData = {
        did: `did:swarmchestrate:${providerWallet.address}`,
        address: providerWallet.address,
        privateKey: providerWallet.privateKey
      };
      fs.writeFileSync(providerFile, JSON.stringify(providerData, null, 2));

      // Fund them with 1 ETH so they can pay for gas
      await web3.eth.sendTransaction({
        from: localDeployer,
        to: providerWallet.address,
        value: web3.utils.toWei('1', 'ether')
      });

      // Register the DID
      web3.eth.accounts.wallet.add(providerWallet.privateKey);
      web3.eth.defaultAccount = providerWallet.address;

      const verificationMethods = [
        {
          id: 1,
          typeOfKey: 1,
          controller: 0,
          publicKeyMultibase: web3.utils.hexToBytes(providerWallet.address)
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

      const gasDID = await swarmchestrate.methods
        .registerDID(universeId, verificationMethods, authentications, services)
        .estimateGas({ from: providerWallet.address });

      const receiptDID = await swarmchestrate.methods
        .registerDID(universeId, verificationMethods, authentications, services)
        .send({ from: providerWallet.address, gas: gasDID });

      const didId = receiptDID.events.DIDRegistered.returnValues.did;
      console.log(`       => DID #${didId} registered. TX=${receiptDID.transactionHash}`);

      // Store DID info for later usage
      didInfos.push({
        address: providerWallet.address,
        privateKey: providerWallet.privateKey,
        didId: parseInt(didId, 10)
      });
    }
    console.log('\n    DIDs registered successfully!\n');

    // ----------------------------------------
    // 4) Issue multiple off-chain credentials
    // ----------------------------------------
    console.log('[4] Off-chain issuing multiple credentials from each DID...');

    const credentialsData = [];
    // We'll store objects of the form: 
    // { didId, issuerAddress, credentialHash, signature, expirationDate }

    for (const didInfo of didInfos) {
      web3.eth.accounts.wallet.add(didInfo.privateKey);
      web3.eth.defaultAccount = didInfo.address;

      // Each DID issues 2 credentials
      for (let i = 1; i <= 2; i++) {
        // Resource address
        const resourceWallet = web3.eth.accounts.create();

        const nowSec = Math.floor(Date.now() / 1000);
        const oneYearSec = 365 * 24 * 60 * 60;
        const expirationDate = nowSec + oneYearSec;

        // Build an off-chain credential
        const offChainCredential = {
          "@context": ["https://www.w3.org/2018/credentials/v1"],
          "type": ["VerifiableCredential", "MultiDIDTestCredential"],
          "issuer": didInfo.address,
          "issuanceDate": nowSec,
          "expirationDate": expirationDate,
          "credentialSubject": {
            "id": resourceWallet.address,
            "info": `Demo credential #${i} from DID #${didInfo.didId}`
          }
        };

        // Generate hash & sign
        const credentialJSON = JSON.stringify(offChainCredential);
        const credentialHash = web3.utils.keccak256(credentialJSON);

        const signObj = web3.eth.accounts.sign(credentialHash, didInfo.privateKey);
        const signature = signObj.signature;

        // Verify on-chain (read-only)
        const isValid = await swarmchestrate.methods
          .verifyOffChainCredential(
            universeId,
            credentialHash,
            didInfo.address,
            signature,
            expirationDate
          )
          .call();

        console.log(`   [IssuerDID=${didInfo.didId}] => Credential #${i} => resource=${resourceWallet.address}`);
        console.log(`       credentialHash=${credentialHash}`);
        console.log(`       signature=${signature}`);
        console.log(`       On-chain verify => ${isValid ? 'VALID' : 'INVALID'}`);

        credentialsData.push({
          didId: didInfo.didId,
          issuerAddress: didInfo.address,
          credentialHash,
          signature,
          expirationDate
        });
      }
    }
    console.log('\n    All credentials were off-chain issued + verified!\n');

    // ----------------------------------------
    // 5) Revoke some credentials (DID-level)
    // ----------------------------------------
    console.log('[5] Revoking half of the credentials, verifying again...');
    
    // We'll revoke the first credential from each DID
    for (let i = 0; i < credentialsData.length; i += 2) {
      const cred = credentialsData[i];

      // Revoke on chain
      web3.eth.accounts.wallet.add(
        didInfos.find(d => d.didId === cred.didId).privateKey
      );
      web3.eth.defaultAccount = cred.issuerAddress;

      const gasRevoke = await swarmchestrate.methods
        .revokeOffChainCredential(
          universeId,
          cred.credentialHash,
          cred.issuerAddress,
          cred.signature,
          cred.expirationDate
        )
        .estimateGas({ from: cred.issuerAddress });

      const receiptRev = await swarmchestrate.methods
        .revokeOffChainCredential(
          universeId,
          cred.credentialHash,
          cred.issuerAddress,
          cred.signature,
          cred.expirationDate
        )
        .send({ from: cred.issuerAddress, gas: gasRevoke });

      console.log(`   => Revoked credentialHash=${cred.credentialHash}. TX=${receiptRev.transactionHash}`);

      // Check again after revocation
      const isStillValid = await swarmchestrate.methods
        .verifyOffChainCredential(
          universeId,
          cred.credentialHash,
          cred.issuerAddress,
          cred.signature,
          cred.expirationDate
        )
        .call();

      console.log(`      => Post-revocation => valid? ${isStillValid ? 'YES' : 'NO'}`);
    }
    console.log('\n    Some credentials are now revoked!\n');

    // ----------------------------------------
    // 6) Rate each DID (0..10) from Universe’s publicKey
    // ----------------------------------------
    console.log('[6] Universe rating each DID provider...');
    // Use the Universe key to sign transactions
    web3.eth.accounts.wallet.add(universePrivateKey);
    web3.eth.defaultAccount = universePublicKey;

    // Rate each DID with a random vote in [5..10]
    const providerDIDs = [];
    const votes = [];
    for (const didInfo of didInfos) {
      providerDIDs.push(didInfo.didId);
      const randomVote = 5 + Math.floor(Math.random() * 6); // 5..10
      votes.push(randomVote);
    }

    console.log(`   Providers = [${providerDIDs.join(', ')}]`);
    console.log(`   Votes = [${votes.join(', ')}]`);

    const gasVote = await swarmchestrate.methods
      .voteProviders(universeId, providerDIDs, votes)
      .estimateGas({ from: universePublicKey });

    const receiptVote = await swarmchestrate.methods
      .voteProviders(universeId, providerDIDs, votes)
      .send({ from: universePublicKey, gas: gasVote });

    console.log(`   => voteProviders TX=${receiptVote.transactionHash}\n`);

    // ----------------------------------------
    // 7) Show final aggregator for each DID
    // ----------------------------------------
    console.log('[7] Retrieving updated scores for each DID...');
    for (const didInfo of didInfos) {
      const result = await swarmchestrate.methods
        .getProviderScore(universeId, didInfo.didId)
        .call();

      const scaledAvg = result[0];
      const totalVotes = result[1];
      const realAvg = (scaledAvg / 100).toFixed(2);
      console.log(`   => DID #${didInfo.didId}, totalVotes=${totalVotes}, avgRating=${realAvg}/10`);
    }

    console.log('\n========================================================');
    console.log('  Advanced Demo complete! Multiple DIDs, credentials,    ');
    console.log('  revocations (at the DID level), and ratings were       ');
    console.log('  performed successfully.                                ');
    console.log('========================================================\n');

  } catch (err) {
    console.error('❌ Error in advancedDemo:', err);
  }
}

// If run directly:
if (require.main === module) {
  advancedDemo();
}

module.exports = advancedDemo;
