# Swarmchestrate Smart Contract

This repository contains a Solidity smart contract (`Swarmchestrate.sol`) and associated files that demonstrate an on-chain DID registration, off-chain credential revocation, and basic reputation scoring mechanism for capacity providers. The contract is based on the idea of “universes,” each of which manages its own Decentralized Identifiers (DIDs) and corresponding data.

## Overview

- **Smart Contract**: `Swarmchestrate.sol`  
  - Registers “universes,” each identified by a unique ID, and tracks a designated public key.  
  - Allows addresses to register as DIDs in a given universe and stores verification methods, authentication data, and service endpoints.  
  - Handles off-chain credential revocation/verification through ECDSA signatures.  
  - Maintains a simple reputation model: “provider score” with integer votes \[0–10\].  
- **JavaScript Test Scripts**: Found under `scripts/` (or `test/`) and leveraged by Truffle to interact with the contract on a local or remote network.


## Prerequisites

- Node.js (v14+ recommended)
- NPM or Yarn
- Truffle
- Ganache CLI

Install Truffle and Ganache CLI:
```bash
npm install -g truffle ganache-cli

## Usage

### 1. Start a Local Blockchain with Ganache

```bash
ganache-cli --networkId 5777
```

### 2. Compile and Deploy the Contract

```bash
truffle compile
truffle migrate --network development --reset
```

### 3. Run Tests

To run the test scripts under `scripts/`, run them with:

```bash
node scripts/advancedDemo.js
```
