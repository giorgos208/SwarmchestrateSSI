// scripts/testRatings.js

const Web3 = require('web3');
const Swarmchestrate = require('../build/contracts/Swarmchestrate.json');
const fs = require('fs');
const path = require('path');

/**
 * Demonstrates the 0..10 rating/voting mechanism for Decentralized Identifiers (DIDs)
 * representing Capacity Providers in Swarmchestrate. 
 * 
 * The rating system is a crucial element of the multi-dimensional ledger:
 *  - Universe owners (via <universePublicKey>) can vote on different provider DIDs.
 *  - Each vote is an integer [0..10], capturing trustworthiness or performance.
 *  - The contract tracks total scores and rating counts for each DID.
 *
 * Usage:
 *   node testRatings.js <universeId> <universePublicKey> <providerDID1> <vote1> [<providerDID2> <vote2> ...]
 *
 *   - <universeId>         Example: 1
 *   - <universePublicKey>  The Universe's registered address, e.g. 0xed7C226F10D8dcbAa123BB2DbE03a8B07089f99f
 *   - For each providerDID + vote pair:
 *       * providerDID is the numeric DID ID (1, 2, etc.)
 *       * vote is in the range [0..10]
 */

async function testRatings() {
  try {
    console.log('========================================================');
    console.log('    Swarmchestrate DID-based Capacity Provider Voting    ');
    console.log('========================================================');

    // Grab CLI args:
    const args = process.argv.slice(2);
    if (args.length < 4) {
      console.log('Usage:\n  node testRatings.js <universeId> <universePublicKey> <providerDID1> <vote1> [<providerDID2> <vote2> ...]');
      process.exit(1);
    }

    // 1) Universe details
    const universeId = parseInt(args[0], 10);
    const universePublicKey = args[1];

    // 2) Build arrays for providerDIDs and votes
    //    The remaining args are pairs: [providerDID, vote].
    const remainingArgs = args.slice(2);
    if (remainingArgs.length % 2 !== 0) {
      console.error('Error: You must supply an even number of arguments for providerDID–vote pairs.');
      process.exit(1);
    }

    const providerDIDs = [];
    const votes = [];
    for (let i = 0; i < remainingArgs.length; i += 2) {
      const pDID = parseInt(remainingArgs[i], 10);
      const pVote = parseInt(remainingArgs[i + 1], 10);
      providerDIDs.push(pDID);
      votes.push(pVote);
    }

    console.log('\n[Step 1] Gathering input parameters:');
    console.log(`  Universe ID:             ${universeId}`);
    console.log(`  Universe Public Key:     ${universePublicKey}`);
    console.log(`  DID(s) to be rated:      [${providerDIDs.join(', ')}]`);
    console.log(`  Corresponding vote(s):   [${votes.join(', ')}]`);
    console.log('  (Each vote is on a 0..10 scale, reflecting trust/performance)');

    // 3) Load Universe's private key from data/<publicKey>.json
    const universeFilePath = path.join(__dirname, `../data/${universePublicKey}.json`);
    if (!fs.existsSync(universeFilePath)) {
      console.error(`Universe publicKey file not found: ${universeFilePath}`);
      return false;
    }
    const universeAccount = JSON.parse(fs.readFileSync(universeFilePath));
    console.log(`\n[Step 2] Loading Universe account from: ${universeFilePath}`);

    // 4) Connect to local Ethereum node
    const web3 = new Web3('http://127.0.0.1:8545');
    console.log('        Connected to local Ethereum node at http://127.0.0.1:8545');

    // 5) Import Universe's private key to sign transactions
    web3.eth.accounts.wallet.add(universeAccount.privateKey);
    web3.eth.defaultAccount = universeAccount.address;
    console.log(`        Universe account loaded: ${universeAccount.address}`);

    // 6) Retrieve the deployed Swarmchestrate contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Swarmchestrate.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`Swarmchestrate not deployed on current network (ID=${networkId}).`);
      return false;
    }
    const contractAddress = deployedNetwork.address;
    const swarmchestrate = new web3.eth.Contract(Swarmchestrate.abi, contractAddress);
    console.log(`        Using contract at ${contractAddress}`);

    // ------------------------------------------------------------
    // A) Universe casts votes for the capacity provider(s)
    // ------------------------------------------------------------
    console.log(`\n[Step 3] Universe #${universeId} casting votes for Capacity Providers (DIDs)...`);
    try {
      console.log('        Preparing voteProviders(...) transaction...');
      const gasEstimate = await swarmchestrate.methods
        .voteProviders(universeId, providerDIDs, votes)
        .estimateGas({ from: universeAccount.address });

      // Submit the transaction
      const txReceipt = await swarmchestrate.methods
        .voteProviders(universeId, providerDIDs, votes)
        .send({ from: universeAccount.address, gas: gasEstimate });

      console.log(`        ✅ voteProviders() successful! TX hash: ${txReceipt.transactionHash}`);
      console.log(`        The Universe has recorded ${providerDIDs.length} new vote(s).`);
    } catch (err) {
      console.error('❌ Error during voteProviders() transaction:', err);
      return false;
    }

    // ------------------------------------------------------------
    // B) Fetch & display the updated aggregator for each provider
    // ------------------------------------------------------------
    console.log(`\n[Step 4] Retrieving updated scores for each DID from Universe #${universeId}...`);

    for (let i = 0; i < providerDIDs.length; i++) {
      const thisProviderDID = providerDIDs[i];
      try {
        // getProviderScore() → (scaledAverage, totalVotes)
        const result = await swarmchestrate.methods
          .getProviderScore(universeId, thisProviderDID)
          .call();

        const scaledAverage = result[0]; // integer in [0..1000] for [0..10.00]
        const totalVotes = result[1];
        const realAvg = (scaledAverage / 100).toFixed(2);

        console.log(`   • Provider DID #${thisProviderDID}`);
        console.log(`       - Total Votes:   ${totalVotes}`);
        console.log(`       - Avg. Rating:   ${realAvg} / 10`);
        console.log('         (Derived from the aggregator of all 0..10 votes)');
      } catch (err) {
        console.error(`   ❌ Error fetching score for DID #${thisProviderDID}:`, err);
      }
    }

    return true;
  } catch (err) {
    console.error('Unexpected error in testRatings():', err);
    return false;
  }
}

// If run directly from the CLI, execute the function:
if (require.main === module) {
  testRatings().then(success => {
    if (success) {
      console.log('Rating tests completed successfully.\n');
    } else {
      console.log('Rating tests failed (see error logs).\n');
    }
  });
}

