// scripts/revokeCredential.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const fs = require('fs');
const path = require('path');

/**
 * Revokes an existing credential in a Universe.
 * If credentialId is not provided, fetches all from events and 
 * revokes the first one. 
 */
async function revokeCredential(universeId, issuerAddress, credentialId) {
  console.log('========================================================');
  console.log('  Revoking a Swarmchestrate Credential                  ');
  console.log('========================================================\n');

  try {
    // 1) Load issuer data
    const issuerFilePath = path.join(__dirname, `../data/${issuerAddress}.json`);
    if (!fs.existsSync(issuerFilePath)) {
      console.error(`❌ Issuer data not found for address=${issuerAddress}`);
      return false;
    }
    const issuerAccount = JSON.parse(fs.readFileSync(issuerFilePath));

    // 2) Connect
    const web3 = new Web3('http://127.0.0.1:8545');
    web3.eth.accounts.wallet.add(issuerAccount.privateKey);
    web3.eth.defaultAccount = issuerAccount.address;

    // 3) Contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return false;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Universe ID:  ${universeId}`);
    console.log(`    Issuer Addr:  ${issuerAddress}`);

    // 4) If no credentialId, fetch from events
    if (!credentialId || credentialId === 0) {
      console.log('    No credentialId provided. Fetching all from CredentialIssued events...');
      const events = await swarmchestrate.getPastEvents('CredentialIssued', {
        filter: { universeId },
        fromBlock: 0,
        toBlock: 'latest'
      });

      if (!events.length) {
        console.log(`    No issued credentials found in universe #${universeId}.`);
        return false;
      }

      const allCredentialIds = events.map(e => parseInt(e.returnValues.credentialId, 10));
      console.log(`    Found credential IDs: ${allCredentialIds.join(', ')}`);
      credentialId = allCredentialIds[0];
      console.log(`    Auto-selecting the first credentialId=${credentialId} to revoke.`);
    }

    console.log(`\n[2] Revoking credential #${credentialId} in Universe #${universeId}...`);
    const gasEstimate = await swarmchestrate.methods
      .revokeCredential(universeId, credentialId)
      .estimateGas({ from: issuerAccount.address });

    const receipt = await swarmchestrate.methods
      .revokeCredential(universeId, credentialId)
      .send({ from: issuerAccount.address, gas: gasEstimate });

    console.log(`    ✅ Credential #${credentialId} revoked successfully.`);
    console.log(`       TX: ${receipt.transactionHash}`);

    console.log('\n========================================================');
    console.log('  Credential revoked. Further verifications should show ');
    console.log('  this credential as INVALID.                           ');
    console.log('========================================================\n');

    return true;
  } catch (error) {
    console.error('❌ Error revoking credential:', error);
    return false;
  }
}

module.exports = revokeCredential;

// If run directly, parse CLI arguments
// Usage:
//   node revokeCredential.js <universeId> <issuerAddress> [<credentialId>]
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node revokeCredential.js <universeId> <issuerAddress> [<credentialId>]');
    process.exit(1);
  }
  const universeId = parseInt(args[0], 10);
  const issuerAddress = args[1];
  const credentialId = args[2] ? parseInt(args[2], 10) : 0;

  revokeCredential(universeId, issuerAddress, credentialId).then(success => {
    if (success) {
      console.log('Done.');
    } else {
      console.log('Failed to revoke credential.');
    }
  });
}
