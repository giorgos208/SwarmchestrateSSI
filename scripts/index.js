const registerDID = require('./registerDid');
const issueCredential = require('./issueCredential');
const verifyCredential = require('./verifyCredential');

(async () => {
  try {
    // Register issuer DID (e.g., XYZ University)
    console.log('Registering issuer DID...');
    const issuer = await registerDID(true);  // Register as Resource Owner

    if (!issuer) {
      console.error('Issuer registration failed.');
      return;
    }

    // Generate subject DID (e.g., Alice)
    console.log('Generating subject DID...');
    const subject = await registerDID(false);  // Register as Resource (use false)

    if (!subject) {
      console.error('Subject DID generation failed.');
      return;
    }

    console.log(`Generated subject DID: ${subject.did}`);
    console.log(`Subject Public Key: ${subject.wallet.address}`);

    // Issue a credential to the subject
    console.log('Issuing credential...');
    const credential = await issueCredential(issuer, subject.did);

    if (!credential) {
      console.error('Credential issuance failed.');
      return;
    }

    console.log('Credential issued:', credential);

    // Verify the credential
    console.log('Verifying credential...');
    const isValid = await verifyCredential(credential, true);  // Passing true for issuer verification

    console.log('Credential verification result:', isValid ? 'Valid' : 'Invalid');
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
})();
