// scripts/verifyAllCredentials.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');

/**
 * Verifies the validity of credentials in a Universe.
 * If no credential IDs are provided, it fetches all from 
 * the CredentialIssued event and verifies them in a batch.
 *
 * Example usage:
 *   # Verify all in Universe #1
 *   node verifyAllCredentials.js 1
 *   # Verify only credential #1
 *   node verifyAllCredentials.js 1 1
 *   # Verify multiple specific IDs
 *   node verifyAllCredentials.js 1 2 3 4
 */
async function verifyAllCredentials(universeId, credentialIds = []) {
  console.log('========================================================');
  console.log('  Verifying Swarmchestrate Credentials – Batch Mode     ');
  console.log('========================================================\n');

  try {
    // 1) Connect
    const web3 = new Web3('http://127.0.0.1:8545');

    // 2) Load contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`❌ Swarmchestrate not deployed on network ID ${networkId}`);
      return;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);

    console.log(`[1] Universe ID = ${universeId}`);
    if (!credentialIds.length) {
      console.log('    No credential IDs specified. Will fetch all from events...');
      const events = await swarmchestrate.getPastEvents('CredentialIssued', {
        filter: { universeId },
        fromBlock: 0,
        toBlock: 'latest'
      });

      if (!events.length) {
        console.log(`    No credentials found for universe #${universeId}. Nothing to verify.`);
        return;
      }

      credentialIds = events.map(e => e.returnValues.credentialId);
      console.log(`    Found ${credentialIds.length} credentials: ${credentialIds.join(', ')}`);
    } else {
      console.log(`    Verifying these credential IDs: ${credentialIds.join(', ')}`);
    }

    // 3) Verify multiple credentials
    console.log('\n[2] Calling verifyMultipleCredentials()...');
    const results = await swarmchestrate.methods
      .verifyMultipleCredentials(universeId, credentialIds)
      .call();

    console.log('    Verification results:');
    results.forEach((isValid, idx) => {
      const credId = credentialIds[idx];
      console.log(`       • Credential #${credId} → ${isValid ? 'VALID' : 'INVALID'}`);
    });

    console.log('\n========================================================');
    console.log('  Credential verification process complete.             ');
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Error verifying credentials:', error);
  }
}

// Export for external usage
module.exports = verifyAllCredentials;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node verifyAllCredentials.js <universeId> [<credentialId1> <credentialId2> ...]');
    process.exit(1);
  }

  const universeId = parseInt(args[0], 10);
  const credentialIds = args.slice(1).map(id => parseInt(id, 10));
  verifyAllCredentials(universeId, credentialIds);
}
