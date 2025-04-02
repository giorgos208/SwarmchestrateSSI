// scripts/issueCredential.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const fs = require('fs');
const path = require('path');

/**
 * Demonstrates issuing multiple credentials in a single transaction (issueMultipleCredentials).
 * The issuer DID signs the credentials for the subjects, storing them on-chain in Swarmchestrate.
 */
async function issueCredential(universeId, issuerAddress, subjectAddress) {
  console.log('========================================================');
  console.log('  Issuing Verifiable Credentials in Swarmchestrate      ');
  console.log('========================================================\n');

  try {
    // 1) Load issuer account data
    const issuerFilePath = path.join(__dirname, `../data/${issuerAddress}.json`);
    if (!fs.existsSync(issuerFilePath)) {
      console.error(`❌ Issuer account data not found for address ${issuerAddress}`);
      return null;
    }
    const issuerAccount = JSON.parse(fs.readFileSync(issuerFilePath));

    // 2) Connect to Ethereum node
    const web3 = new Web3('http://127.0.0.1:8545');
    web3.eth.accounts.wallet.add(issuerAccount.privateKey);
    web3.eth.defaultAccount = issuerAccount.address;

    // 3) Load Swarmchestrate contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return null;
    }

    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Universe ID:     ${universeId}`);
    console.log(`    Issuer DID Addr: ${issuerAddress}`);
    console.log(`    Subject Address: ${subjectAddress}\n`);

    // 4) Check if issuer DID is registered
    const BN = web3.utils.BN;
    const issuerDidIdRaw = await swarmchestrate.methods.getDIDId(universeId, issuerAccount.address).call();
    const issuerDidId = new BN(issuerDidIdRaw);
    if (issuerDidId.isZero()) {
      console.error(`❌ Issuer DID not registered in universe ${universeId}`);
      return null;
    }
    console.log(`    ✔ Issuer DID ID in this Universe: ${issuerDidId.toString()}`);

    // 5) Prepare arrays for issueMultipleCredentials
    const subjectAddresses = [
      subjectAddress,
      '0xdfF4997f03EA398320B7E1A2b32b2838c59830fa',
      '0x5d7A3eBe20800708a5f87Fa101643799a8130CdC'
    ];
    console.log('[2] Will issue credentials to these subject addresses:');
    subjectAddresses.forEach((addr, i) => {
      console.log(`    [${i+1}] ${addr}`);
    });

    // Example credential types
    const VERIFIABLE_CREDENTIAL = new BN(1);
    const DEGREE_CREDENTIAL = new BN(2);

    let credentialTypesArray = [];
    let credentialSubjectHashes = [];
    let issuanceDates = [];
    let expirationDates = [];
    let issuerSignatures = [];

    // We assume VC_CONTEXT = 2 for demonstration
    const VC_CONTEXT = new BN(2);

    for (let i = 0; i < subjectAddresses.length; i++) {
      // Create a dummy JSON subject object & hash
      const credentialSubjectData = {
        degree: {
          type: 'BachelorDegree',
          name: `Bachelor of Science #${i + 1}`,
        },
      };
      const credentialSubjectJSON = JSON.stringify(credentialSubjectData);
      const credentialSubjectHash = web3.utils.keccak256(credentialSubjectJSON);

      // Each credential has the same basic types in this demo
      const _credentialTypes = [VERIFIABLE_CREDENTIAL, DEGREE_CREDENTIAL];
      credentialTypesArray.push(_credentialTypes.map(t => t.toString()));

      // Timestamps
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const issuanceDate = new BN(nowInSeconds);
      const oneYearInSeconds = new BN(365 * 24 * 60 * 60);
      const _expirationDate = issuanceDate.add(oneYearInSeconds);

      // Build the same hash the contract checks
      let credentialTypesPacked = '';
      for (let j = 0; j < _credentialTypes.length; j++) {
        const typeHex = web3.utils.padLeft(_credentialTypes[j].toString(16), 64);
        credentialTypesPacked += typeHex;
      }
      const credentialTypesHash = web3.utils.keccak256('0x' + credentialTypesPacked);

      const credentialHashPacked = web3.utils.soliditySha3(
        { t: 'uint256', v: VC_CONTEXT.toString() },
        { t: 'bytes32', v: credentialTypesHash },
        { t: 'uint256', v: issuerDidId.toString() },
        { t: 'address', v: subjectAddresses[i] },
        { t: 'uint256', v: issuanceDate.toString() },
        { t: 'uint256', v: _expirationDate.toString() },
        { t: 'bytes32', v: credentialSubjectHash }
      );

      // Sign with issuer's private key
      const signatureObj = web3.eth.accounts.sign(credentialHashPacked, issuerAccount.privateKey);
      const issuerSignature = signatureObj.signature;

      credentialSubjectHashes.push(credentialSubjectHash);
      issuanceDates.push(issuanceDate.toString());
      expirationDates.push(_expirationDate.toString());
      issuerSignatures.push(issuerSignature);
    }

    console.log('\n[3] Submitting issueMultipleCredentials transaction...');
    const gasEstimate = await swarmchestrate.methods.issueMultipleCredentials(
      universeId,
      subjectAddresses,
      credentialTypesArray,
      credentialSubjectHashes,
      issuanceDates,
      expirationDates,
      issuerSignatures
    ).estimateGas({ from: issuerAccount.address });

    const receipt = await swarmchestrate.methods.issueMultipleCredentials(
      universeId,
      subjectAddresses,
      credentialTypesArray,
      credentialSubjectHashes,
      issuanceDates,
      expirationDates,
      issuerSignatures
    ).send({ from: issuerAccount.address, gas: gasEstimate });

    console.log(`    ✅ Multi-credential issuance TX: ${receipt.transactionHash}`);

    // The contract emits multiple CredentialIssued events (one per credential)
    if (receipt.events && receipt.events.CredentialIssued) {
      const events = receipt.events.CredentialIssued;
      if (Array.isArray(events)) {
        console.log(`\n[4] Issued ${events.length} credentials. IDs:`);
        events.forEach((ev, idx) => {
          console.log(`    - Credential #${idx+1}: ID=${ev.returnValues.credentialId}`);
        });
      } else {
        console.log('Issued a single credential: ID=', events.returnValues.credentialId);
      }
    }

    console.log('\n========================================================');
    console.log('  Credential issuance complete. These credentials now    ');
    console.log('  reside on-chain and can be verified or revoked later.  ');
    console.log('========================================================\n');

    // Return the first credential ID for convenience
    if (Array.isArray(receipt.events.CredentialIssued)) {
      return receipt.events.CredentialIssued[0].returnValues.credentialId;
    } else {
      return receipt.events.CredentialIssued.returnValues.credentialId;
    }
  } catch (error) {
    console.error('❌ Error issuing multiple credentials:', error);
    if (error.receipt) {
      console.error('Transaction Receipt:', error.receipt);
    }
    return null;
  }
}

module.exports = issueCredential;
