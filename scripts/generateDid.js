// scripts/generateDID.js

const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

/**
 * Generates a new DID for a capacity provider or resource.
 * Creates a random Ethereum account and logs it. 
 * Funds the new account with 1 ETH from local[0].
 * Saves data to data/<address>.json
 */
async function generateDID() {
  console.log('========================================================');
  console.log('  Generating a new DID for Swarmchestrate Identity Mgmt  ');
  console.log('========================================================\n');

  // Connect to your Ethereum node
  const web3 = new Web3('http://127.0.0.1:8545');

  // Generate a random wallet
  const account = web3.eth.accounts.create();

  // DID method as per the contract
  const did = `did:swarmchestrate:${account.address}`;

  console.log('[1] Created DID:       ', did);
  console.log('    Public Key:        ', account.address);
  console.log('    Private Key:       ', account.privateKey);

  // Save the account to a file
  const accountData = {
    did: did,
    address: account.address,
    privateKey: account.privateKey,
  };

  const filePath = path.join(__dirname, `../data/${account.address}.json`);
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(accountData, null, 2));
  console.log(`\n[2] Account data saved to ${filePath}.`);

  // Fund the new account
  const accounts = await web3.eth.getAccounts();
  const fromAccount = accounts[0];
  console.log(`\n[3] Funding new DID/account ${account.address} with 1 ETH from ${fromAccount}...`);
  const tx = await web3.eth.sendTransaction({
    from: fromAccount,
    to: account.address,
    value: web3.utils.toWei('1', 'ether'), // 1 ETH
    gas: 21000,
  });

  console.log(`    ✅ Sent 1 ETH. Transaction Hash: ${tx.transactionHash}`);

  console.log('\n========================================================');
  console.log('  DID generation complete. Use this DID to register a   ');
  console.log('  capacity provider');
  console.log('========================================================\n');

  return { did, account };
}

// Execute the function if the script is run directly
if (require.main === module) {
  generateDID();
}

module.exports = generateDID;
