// scripts/generateDid.js

const { ethers } = require('ethers');

function generateDID() {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();

  // DID method could be 'did:example' for this example
  const did = `did:example:${wallet.address}`;

  console.log('DID:', did);
  console.log('Public Key:', wallet.publicKey);
  console.log('Private Key:', wallet.privateKey);

  return { did, wallet };
}
// Execute the function if the script is run directly
if (require.main === module) {
    generateDID();
  }
module.exports = generateDID;
