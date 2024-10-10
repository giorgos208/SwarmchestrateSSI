const Swarmchestrate = artifacts.require("Swarmchestrate");

contract("Swarmchestrate", (accounts) => {
    let swarmchestrate;
    const owner = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];

    before(async () => {
        swarmchestrate = await Swarmchestrate.deployed();
    });

    it("should register a DID", async function() {
        // Prepare verification methods, authentications, services
        const verificationMethods = [
            {
                id: "key-1",
                typeOfKey: "EcdsaSecp256k1VerificationKey2019",
                controller: "did:swarmchestrate:" + owner,
                publicKeyMultibase: owner // Assuming publicKeyMultibase is the address
            }
        ];
        const authentications = ["key-1"];
        const services = [
            {
                id: "service-1",
                typeOfService: "LinkedDomains",
                serviceEndpoint: "https://example.com"
            }
        ];

        // Call registerDID
        await swarmchestrate.registerDID(verificationMethods, authentications, services, { from: owner });

        // Verify that DID is registered
        const did = await swarmchestrate.constructDID(owner);
        const didDocument = await swarmchestrate.didDocuments(did);

        assert.equal(didDocument.owner, owner, "DID owner should be owner");
        assert.equal(didDocument.exists, true, "DID should exist");
    });

    it("should update a DID Document", async function() {
        // Prepare new verification methods, authentications, services
        const verificationMethods = [
            {
                id: "key-2",
                typeOfKey: "EcdsaSecp256k1VerificationKey2019",
                controller: "did:swarmchestrate:" + owner,
                publicKeyMultibase: user1 // New public key
            }
        ];
        const authentications = ["key-2"];
        const services = [
            {
                id: "service-2",
                typeOfService: "MessagingService",
                serviceEndpoint: "https://example.org"
            }
        ];

        // Call updateDIDDocument
        await swarmchestrate.updateDIDDocument(verificationMethods, authentications, services, { from: owner });

        // Verify that DID Document is updated (by checking event emission)
        const events = await swarmchestrate.getPastEvents('DIDUpdated', {
            fromBlock: 0,
            toBlock: 'latest'
        });

        const did = await swarmchestrate.constructDID(owner);
        assert.equal(events[0].returnValues.did, did, "DID should match in the event");
    });

    it("should deactivate a DID", async function() {
        // Call deactivateDID
        await swarmchestrate.deactivateDID({ from: owner });

        // Verify that the DID is deactivated by attempting to resolve it
        const did = await swarmchestrate.constructDID(owner);
        try {
            await swarmchestrate.resolveDID(did);
            assert.fail("Expected error not received");
        } catch (error) {
            assert(error.message.includes("DID does not exist"), "Expected 'DID does not exist' error");
        }
    });

    it("should issue a credential", async function() {
        // Re-register owner's DID (since it was deactivated)
        const verificationMethods = [
            {
                id: "key-1",
                typeOfKey: "EcdsaSecp256k1VerificationKey2019",
                controller: "did:swarmchestrate:" + owner,
                publicKeyMultibase: owner
            }
        ];
        await swarmchestrate.registerDID(verificationMethods, ["key-1"], [], { from: owner });

        // Register user1's DID
        const userVerificationMethods = [
            {
                id: "key-1",
                typeOfKey: "EcdsaSecp256k1VerificationKey2019",
                controller: "did:swarmchestrate:" + user1,
                publicKeyMultibase: user1
            }
        ];
        await swarmchestrate.registerDID(userVerificationMethods, ["key-1"], [], { from: user1 });

        const subjectDID = await swarmchestrate.constructDID(user1);
        const credentialTypes = ["VerifiableCredential", "ExampleCredential"];
        const credentialSubject = "Example credential subject data";
        const expirationDate = (Math.floor(Date.now() / 1000) + 3600).toString(); // Expires in 1 hour

        // Prepare data for signature
        const credentialHash = web3.utils.soliditySha3(
            { type: 'string', value: "https://www.w3.org/2018/credentials/v1" },
            { type: 'string', value: "" }, // Credential ID will be generated in the contract
            { type: 'string[]', value: credentialTypes },
            { type: 'string', value: await swarmchestrate.constructDID(owner) },
            { type: 'string', value: "" }, // Issuance date will be set in the contract
            { type: 'string', value: expirationDate },
            { type: 'string', value: credentialSubject }
        );

        // Sign the hash
        const signature = await web3.eth.sign(credentialHash, owner);

        // Issue the credential
        const tx = await swarmchestrate.issueCredential(
            subjectDID,
            credentialTypes,
            credentialSubject,
            expirationDate,
            signature,
            { from: owner }
        );

        // Verify event emission
        const events = tx.logs.filter(log => log.event === 'CredentialIssued');
        assert.equal(events.length, 1, "One CredentialIssued event should have been emitted");
        const credentialId = events[0].args.credentialId;
        this.credentialId = credentialId; // Store for later tests
    });

    it("should verify a credential", async function() {
        const credentialId = this.credentialId;
        const isValid = await swarmchestrate.verifyCredential(credentialId, { from: user1 });
        assert.equal(isValid, true, "Credential should be valid");
    });

    it("should revoke a credential", async function() {
        const credentialId = this.credentialId;
        await swarmchestrate.revokeCredential(credentialId, { from: owner });

        // Verify that the credential is revoked
        try {
            const isValid = await swarmchestrate.verifyCredential(credentialId, { from: user1 });
            assert.equal(isValid, false, "Credential should be invalid after revocation");
        } catch (error) {
            assert(error.message.includes("Credential is revoked"), "Expected 'Credential is revoked' error");
        }
    });

    it("should rate a resource", async function() {
        // Register a resource DID
        const resourceDID = await swarmchestrate.constructDID(user2);
        const resourceVerificationMethods = [
            {
                id: "key-1",
                typeOfKey: "EcdsaSecp256k1VerificationKey2019",
                controller: resourceDID,
                publicKeyMultibase: user2
            }
        ];
        await swarmchestrate.registerDID(resourceVerificationMethods, ["key-1"], [], { from: user2 });

        // User1 rates the resource
        await swarmchestrate.rateResource(resourceDID, 5, "Excellent resource!", { from: user1 });

        // Verify event emission
        const events = await swarmchestrate.getPastEvents('ResourceRated', {
            fromBlock: 0,
            toBlock: 'latest'
        });
        assert(events.length >= 1, "At least one ResourceRated event should have been emitted");
    });

    it("should retrieve resource ratings", async function() {
        const resourceDID = await swarmchestrate.constructDID(user2);
        const result = await swarmchestrate.getResourceRating(resourceDID);
        const averageRating = result.averageRating.toNumber();
        const totalRatings = result.totalRatings.toNumber();

        assert.equal(averageRating, 500, "Average rating should be 500 (scaled by 100)");
        assert.equal(totalRatings, 1, "Total ratings should be 1");
    });

    it("should not allow unregistered users to perform restricted actions", async function() {
        try {
            await swarmchestrate.updateDIDDocument([], [], [], { from: user3 });
            assert.fail("Expected error not received");
        } catch (error) {
            assert(error.message.includes("Caller is not a registered DID"), "Expected 'Caller is not a registered DID' error");
        }
    });

    it("should pause and unpause the contract", async function() {
        // Pause the contract
        await swarmchestrate.pause({ from: owner });

        // Try to register a DID while paused
        try {
            await swarmchestrate.registerDID([], [], [], { from: user3 });
            assert.fail("Expected error not received");
        } catch (error) {
            assert(error.message.includes("Pausable: paused"), "Expected 'Pausable: paused' error");
        }

        // Unpause the contract
        await swarmchestrate.unpause({ from: owner });

        // Now the action should succeed
        await swarmchestrate.registerDID([], [], [], { from: user3 });
        const did = await swarmchestrate.constructDID(user3);
        const didDocument = await swarmchestrate.didDocuments(did);
        assert.equal(didDocument.exists, true, "DID should exist after unpausing");
    });
});
