const Web3 = require('web3');
const { ethers } = require('ethers'); 
const crypto = require('crypto');
const stringify = require('json-stable-stringify'); 
const DIDRegistry = require('../build/contracts/DIDRegistry.json');

async function verifyCredential(credential, isResourceOwner = false) {
  try {
    // Connect to local blockchain
    const web3 = new Web3('http://127.0.0.1:8545'); 

    // Get network ID and deploy contract instance
    const networkId = await web3.eth.net.getId();
    console.log(`Network ID: ${networkId}`);
    const deployedNetwork = DIDRegistry.networks[networkId];
    if (!deployedNetwork || !deployedNetwork.address) {
      console.error(`DIDRegistry contract not deployed on network ID ${networkId}`);
      return false;
    }

    const contractAddress = deployedNetwork.address;
    console.log(`DIDRegistry Contract Address: ${contractAddress}`);
    const didRegistry = new web3.eth.Contract(DIDRegistry.abi, deployedNetwork.address);

    // Convert issuer DID to bytes32 using web3.utils.soliditySha3 for consistency
    const issuerDIDHash = web3.utils.soliditySha3(credential.issuer);
    console.log(`Issuer DID Hash (bytes32): ${issuerDIDHash}`);

    // Retrieve the issuer's public key from the blockchain
    const publicKey = await didRegistry.methods.getPublicKey(issuerDIDHash, isResourceOwner).call();
    console.log(`Retrieved Public Key: ${publicKey}`);
    if (!publicKey || publicKey === '0x0000000000000000000000000000000000000000') {
      console.log('Issuer DID not found.');
      return false;
    }

    // Serialize the credential consistently using json-stable-stringify
    const credentialCopy = { ...credential };
    delete credentialCopy.proof; // Remove proof before hashing

    const credentialHash = crypto
      .createHash('sha256')
      .update(stringify(credentialCopy)) // Use stable stringify
      .digest('hex'); // Get hex string
    const credentialHashHex = `0x${credentialHash}`; // Add '0x' prefix
    console.log(`Credential Hash (SHA-256 hex): ${credentialHashHex}`);

    // Check if the credential is revoked
    const isRevoked = await didRegistry.methods.isCredentialRevoked(credentialHashHex).call();
    console.log(`Is Credential Revoked: ${isRevoked}`);
    if (isRevoked) {
      console.log('Credential is revoked.');
      return false;
    }

    // Retrieve the signature value from the proof object
    const signature = credential.proof.signatureValue;
    console.log(`Signature Value: ${signature}`);

    // Verify the signature using ethers.js
    const signerAddress = ethers.verifyMessage(credentialHashHex, signature);
    console.log(`Signer Address: ${signerAddress}`);

    // Extract the issuer address from DID
    const issuerAddress = credential.issuer.split(':').pop().toLowerCase();
    console.log(`Issuer Address from DID: ${issuerAddress}`);

    if (signerAddress.toLowerCase() === issuerAddress) {
      console.log('Credential is valid and verified.');
      return true;
    } else {
      console.log('Credential verification failed.');
      return false;
    }
  } catch (error) {
    console.error("Error verifying credential:", error.message);
    return false;
  }
}

module.exports = verifyCredential;
