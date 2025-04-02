Swarmchestrate Smart Contract
This repository contains a Solidity smart contract (Swarmchestrate.sol) and associated files that demonstrate an on-chain DID registration, off-chain credential revocation, and basic reputation scoring mechanism for capacity providers. The contract is based on the idea of “universes,” each of which manages its own Decentralized Identifiers (DIDs) and corresponding data.
Overview
- Smart Contract: Swarmchestrate.sol
  - Registers “universes,” each identified by a unique ID, and tracks a designated public key.
  - Allows addresses to register as DIDs in a given universe and stores verification methods, authentication data, and service endpoints.
  - Handles off-chain credential revocation/verification through ECDSA signatures.
  - Maintains a simple reputation model: “provider score” with integer votes [0–10].
- JavaScript Test Scripts: Found under scripts/ (or test/) and leveraged by Truffle to interact with the contract on a local or remote network.

Project Structure

.
├── contracts/
│   └── Swarmchestrate.sol        # Main smart contract
├── migrations/
│   └── 1_deploy_contracts.js     # Script to deploy the contract
├── scripts/                      # (Optional) Additional interaction scripts
├── test/                         # JavaScript tests
├── package.json
├── package-lock.json
├── truffle-config.js             # Truffle configuration
└── README.md

Prerequisites
- Node.js (v14+ recommended)
- NPM or Yarn
- Truffle
- Ganache CLI
Installation
1. Clone or download this repository.
2. Run `npm install` to install dependencies.
Usage
Start a local blockchain with: ganache-cli --networkId 5777
Compile and deploy:
truffle compile
truffle migrate --network development --reset
Run tests:
truffle test
Key Contract Features
1. Universe Registration
2. DID Registration
3. Off-Chain Credential Revocation
4. Provider Reputation Scoring
Troubleshooting
- Ensure Ganache is running on :8545
- Confirm the network ID matches (5777)
- Verify the Solidity version matches ^0.8.19
License
This project is licensed under the MIT License.
Disclaimer: This repository is for demonstration. Always audit smart contracts before production.
![image](https://github.com/user-attachments/assets/47a861da-774a-4d00-91ae-f9fe13adceae)
