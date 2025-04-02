// scripts/registerDID.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const fs = require('fs');
const path = require('path');

/**
 * Registers a DID in a specified Universe.
 * This associates the newly generated address with 
 * a DIDDocument on-chain for Identity & Access in Swarmchestrate.
 */
async function registerDID(universeId, accountAddress) {
  console.log('========================================================');
  console.log('  Registering DID in Swarmchestrate Universe            ');
  console.log('========================================================\n');

  try {
    // 1) Load the local data/<accountAddress>.json
    const filePath = path.join(__dirname, `../data/${accountAddress}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ DID account file not found for address: ${accountAddress}`);
      return;
    }
    const accountData = JSON.parse(fs.readFileSync(filePath));

    // 2) Connect to Ethereum node
    const web3 = new Web3('http://127.0.0.1:8545');
    web3.eth.accounts.wallet.add(accountData.privateKey);
    web3.eth.defaultAccount = accountData.address;

    // 3) Retrieve Swarmchestrate contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return;
    }

    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Universe ID: ${universeId}`);
    console.log(`    Using DID:   ${accountData.did}`);
    console.log(`    Caller:      ${accountData.address}`);

    console.log('\n[2] Preparing DID registration transaction...');
    const verificationMethods = [
      {
        id: 1,
        typeOfKey: 1, // example numeric type
        controller: 0,
        publicKeyMultibase: web3.utils.hexToBytes(accountData.address),
      },
    ];

    const authentications = [1];
    const services = [
      {
        id: 1,
        typeOfService: 1,
        serviceEndpoint: "https://example.com/messaging",
      },
    ];

    const gasEstimate = await swarmchestrate.methods.registerDID(
      universeId,
      verificationMethods,
      authentications,
      services
    ).estimateGas({ from: accountData.address });

    const receipt = await swarmchestrate.methods.registerDID(
      universeId,
      verificationMethods,
      authentications,
      services
    ).send({ from: accountData.address, gas: gasEstimate });

    const event = receipt.events.DIDRegistered;
    const didId = event.returnValues.did;

    console.log(`    ✅ DID registered with ID=${didId}.`);
    console.log(`       Transaction Hash: ${receipt.transactionHash}`);

    // Verify the DID
    const fetchedDID = await swarmchestrate.methods.getDIDId(universeId, accountData.address).call();
    if (parseInt(fetchedDID) !== parseInt(didId)) {
      console.error(`❌ DID verification mismatch (expected ${didId}, got ${fetchedDID}).`);
    } else {
      console.log(`    ✔ DID verified successfully. (DID ID = ${fetchedDID})`);
    }

    console.log('\n========================================================');
    console.log('  DID registration complete. This DID can now issue or   ');
    console.log('  hold credentials, and participate in on-chain actions. ');
    console.log('========================================================\n');

    return { didId, account: accountData };
  } catch (error) {
    console.error('❌ Error registering DID:', error);
    if (error.receipt) {
      console.error('Transaction Receipt:', error.receipt);
    }
    return null;
  }
}

module.exports = registerDID;

// Example CLI usage:
//   node scripts/registerDID.js <universeId> <accountAddress>
if (require.main === module) {
  const universeId = 1;
  const accountAddress = '0x5F776f45A82d55aFD71EA75cDF892fa594fA3D48';
  registerDID(universeId, accountAddress);
}
