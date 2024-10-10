// scripts/issueCredential.js

const { ethers } = require('ethers');
const crypto = require('crypto');
const stringify = require('json-stable-stringify'); // Ensure consistent JSON serialization

async function issueCredential(issuer, subjectDid) {
  try {
    const credential = {
      '@context': 'https://www.w3.org/2018/credentials/v1',
      id: 'http://example.edu/credentials/3732',
      type: ['VerifiableCredential', 'DegreeCredential'],
      issuer: issuer.did,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: subjectDid,
        degree: {
          type: 'BachelorDegree',
          name: 'Bachelor of Science in Computer Science',
        },
      },
      proof: {
        type: 'EcdsaSecp256k1Signature2019',
        created: new Date().toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: issuer.did,
        signatureValue: null,
      },
    };

    // Serialize the credential consistently using json-stable-stringify
    const credentialCopy = { ...credential };
    delete credentialCopy.proof; // Remove proof before hashing

    const credentialHash = crypto
      .createHash('sha256')
      .update(stringify(credentialCopy)) // Use stable stringify
      .digest('hex'); // Get hex string
    const credentialHashHex = `0x${credentialHash}`; // Add '0x' prefix

    console.log(`Credential Hash (SHA-256 hex): ${credentialHashHex}`);

    // Sign the credential hash hex string
    const signature = await issuer.wallet.signMessage(credentialHashHex);
    console.log(`Signature Value: ${signature}`);

    // Attach the signature to the credential's proof
    credential.proof.signatureValue = signature;
    return credential;
  } catch (error) {
    console.error('Error issuing credential:', error.message);
    return null;
  }
}

module.exports = issueCredential;
