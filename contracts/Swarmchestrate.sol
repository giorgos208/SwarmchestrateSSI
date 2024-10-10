// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Import OpenZeppelin's libraries for security and access control
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Swarmchestrate
 * @dev Manages Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs) in compliance with W3C standards.
 *      Allows entities to register and update their DIDs and DID Documents, issue and verify VCs,
 *      handle credential revocation, and enables users to rate resources. Incorporates access control
 *      and pausable functionalities for enhanced security, and conforms to the W3C DID Core and
 *      Verifiable Credentials specifications.
 */
contract Swarmchestrate is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // =============================
    // ======= Data Structures =====
    // =============================

    // DID Document structures as per W3C DID Core Specification

    struct VerificationMethod {
        string id;
        string typeOfKey; // 'type' is a reserved keyword in Solidity
        string controller;
        bytes publicKeyMultibase;
    }

    struct Service {
        string id;
        string typeOfService; // 'type' is a reserved keyword in Solidity
        string serviceEndpoint;
    }

    struct DIDDocument {
        string context; // Should be "https://www.w3.org/ns/did/v1"
        string id;
        VerificationMethod[] verificationMethod;
        string[] authentication;
        Service[] service;
        address owner; // The Ethereum address of the DID controller
        bool exists;
    }

    // Mapping from DID to DID Document
    mapping(string => DIDDocument) public didDocuments;

    // Verifiable Credential structures as per W3C Verifiable Credentials Data Model

    struct Proof {
        string typeOfProof; // 'type' is a reserved keyword in Solidity
        string created;
        string proofPurpose;
        string verificationMethod;
        bytes signature;
    }

    struct VerifiableCredential {
        string context; // Should include "https://www.w3.org/2018/credentials/v1"
        string id;
        string[] typeOfCredential; // 'type' is a reserved keyword in Solidity
        string issuer;
        string issuanceDate;
        string expirationDate;
        string credentialSubject; // This can be more complex depending on the data
        Proof proof;
        bool isRevoked;
    }

    // Mapping from credential ID to Verifiable Credential
    mapping(string => VerifiableCredential) public credentials;

    // Counter to ensure unique credential IDs
    uint256 public credentialCount;

    // =============================
    // ====== Rating Structures ====
    // =============================

    struct Rating {
        address rater;
        uint8 score; // Rating score between 1 and 5
        string comment; // Optional comment
    }

    struct ResourceRatings {
        uint256 totalScore;
        uint256 numberOfRatings;
        mapping(address => bool) hasRated; // To prevent multiple ratings from the same user
    }

    // Mapping from resource DID to its ratings
    mapping(string => ResourceRatings) private resourceRatings;

    // =============================
    // =========== Events ==========
    // =============================

    /// @notice Emitted when a DID is registered.
    event DIDRegistered(string indexed did);

    /// @notice Emitted when a DID Document is updated.
    event DIDUpdated(string indexed did);

    /// @notice Emitted when a DID is deactivated.
    event DIDDeactivated(string indexed did);

    /// @notice Emitted when a new credential is issued.
    event CredentialIssued(
        string indexed credentialId,
        string indexed issuer,
        string indexed subject,
        string credentialType
    );

    /// @notice Emitted when a credential is revoked.
    event CredentialRevoked(string indexed credentialId);

    /// @notice Emitted when a resource is rated.
    event ResourceRated(
        string indexed resourceDID,
        address indexed rater,
        uint8 score,
        string comment
    );

    // =============================
    // ======= Modifiers ==========
    // =============================

    /**
     * @dev Ensures that the caller is a registered DID.
     */
    modifier onlyRegisteredDID() {
        string memory did = constructDID(msg.sender);
        require(
            didDocuments[did].exists,
            "Caller is not a registered DID"
        );
        _;
    }

    /**
     * @dev Ensures that the credential exists.
     * @param credentialId The ID of the credential.
     */
    modifier credentialExists(string memory credentialId) {
        require(
            bytes(credentials[credentialId].id).length != 0,
            "Credential does not exist"
        );
        _;
    }

    /**
     * @dev Ensures that the credential is not revoked.
     * @param credentialId The ID of the credential.
     */
    modifier notRevoked(string memory credentialId) {
        require(!credentials[credentialId].isRevoked, "Credential is revoked");
        _;
    }

    /**
     * @dev Ensures that the resource DID exists.
     * @param resourceDID The DID of the resource.
     */
    modifier resourceExists(string memory resourceDID) {
        require(didDocuments[resourceDID].exists, "Resource DID does not exist");
        _;
    }

    // =============================
    // ======= DID Methods =========
    // =============================

    /**
     * @dev Constructs a DID using the method did:swarmchestrate:<Ethereum address>.
     * @param _address The Ethereum address to be included in the DID.
     * @return The constructed DID as a string.
     */
    function constructDID(address _address) internal pure returns (string memory) {
        return string(abi.encodePacked("did:swarmchestrate:", toHexString(_address)));
    }

    /**
     * @dev Converts an address to its hexadecimal string representation.
     * @param _address The Ethereum address to convert.
     * @return The hexadecimal string representation of the address.
     */
    function toHexString(address _address) internal pure returns (string memory) {
        bytes20 value = bytes20(uint160(_address));
        bytes16 hexSymbols = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexSymbols[uint8(value[i] >> 4)];
            str[3 + i * 2] = hexSymbols[uint8(value[i] & 0x0f)];
        }
        return string(str);
    }

    // =============================
    // ======= Registration ========
    // =============================

    /**
     * @dev Registers the caller's DID with their DID Document.
     *      Can only be called once. Emits a {DIDRegistered} event.
     * @param _verificationMethods The array of verification methods.
     * @param _authentications The array of authentication method IDs.
     * @param _services The array of service endpoints.
     */
    function registerDID(
        VerificationMethod[] memory _verificationMethods,
        string[] memory _authentications,
        Service[] memory _services
    ) external whenNotPaused {
        string memory did = constructDID(msg.sender);
        require(
            !didDocuments[did].exists,
            "DID already registered"
        );

        // Validate that at least one verification method is provided
        require(_verificationMethods.length > 0, "At least one verification method is required");

        // Initialize the DID Document
        DIDDocument storage doc = didDocuments[did];
        doc.context = "https://www.w3.org/ns/did/v1";
        doc.id = did;
        doc.owner = msg.sender;
        doc.exists = true;

        // Add verification methods
        for (uint256 i = 0; i < _verificationMethods.length; i++) {
            doc.verificationMethod.push(_verificationMethods[i]);
        }

        // Add authentications
        for (uint256 i = 0; i < _authentications.length; i++) {
            doc.authentication.push(_authentications[i]);
        }

        // Add services
        for (uint256 i = 0; i < _services.length; i++) {
            doc.service.push(_services[i]);
        }

        emit DIDRegistered(did);
    }

    /**
     * @dev Updates the caller's DID Document.
     *      Can only be called by the registered DID owner. Emits a {DIDUpdated} event.
     * @param _verificationMethods The array of new verification methods.
     * @param _authentications The array of new authentication method IDs.
     * @param _services The array of new service endpoints.
     */
    function updateDIDDocument(
        VerificationMethod[] memory _verificationMethods,
        string[] memory _authentications,
        Service[] memory _services
    ) external whenNotPaused onlyRegisteredDID {
        string memory did = constructDID(msg.sender);
        DIDDocument storage doc = didDocuments[did];

        // Clear existing arrays
        delete doc.verificationMethod;
        delete doc.authentication;
        delete doc.service;

        // Update verification methods
        for (uint256 i = 0; i < _verificationMethods.length; i++) {
            doc.verificationMethod.push(_verificationMethods[i]);
        }

        // Update authentications
        for (uint256 i = 0; i < _authentications.length; i++) {
            doc.authentication.push(_authentications[i]);
        }

        // Update services
        for (uint256 i = 0; i < _services.length; i++) {
            doc.service.push(_services[i]);
        }

        emit DIDUpdated(did);
    }

    /**
     * @dev Deactivates the caller's DID.
     *      Can only be called by the DID owner. Emits a {DIDDeactivated} event.
     */
    function deactivateDID() external whenNotPaused onlyRegisteredDID {
        string memory did = constructDID(msg.sender);
        delete didDocuments[did];

        emit DIDDeactivated(did);
    }

    // =============================
    // ======= DID Resolution ======
    // =============================

    /**
     * @dev Resolves a DID to its corresponding DID Document.
     * @param did The DID to resolve.
     * @return The DID Document associated with the DID.
     */
    function resolveDID(string memory did) external view returns (DIDDocument memory) {
        require(didDocuments[did].exists, "DID does not exist");
        return didDocuments[did];
    }

    // =============================
    // ======= Credential ==========
    // =============================

    /**
     * @dev Issues a verifiable credential by the issuer to a subject.
     *      Emits a {CredentialIssued} event upon success.
     * @param _subjectDID The DID of the credential subject.
     * @param _credentialTypes The types of the credential.
     * @param _credentialSubject The credential subject data (as string, could be JSON).
     * @param _expirationDate The expiration date of the credential.
     * @param _issuerSignature The signature of the issuer over the credential data.
     * @return credentialId The unique ID of the issued credential.
     */
    function issueCredential(
        string memory _subjectDID,
        string[] memory _credentialTypes,
        string memory _credentialSubject,
        string memory _expirationDate,
        bytes memory _issuerSignature
    ) external whenNotPaused onlyRegisteredDID nonReentrant returns (string memory credentialId) {
        require(bytes(_subjectDID).length != 0, "Invalid subject DID");
        require(didDocuments[_subjectDID].exists, "Subject DID not registered");
        require(bytes(_credentialSubject).length != 0, "Credential subject cannot be empty");
        require(_issuerSignature.length == 65, "Invalid issuer signature length");

        string memory issuerDID = constructDID(msg.sender);

        // Increment credential count to ensure uniqueness
        credentialCount += 1;

        // Generate a unique credential ID
        credentialId = string(abi.encodePacked("credential-", uint2str(credentialCount)));

        // Create the credential
        VerifiableCredential storage credential = credentials[credentialId];
        credential.context = "https://www.w3.org/2018/credentials/v1";
        credential.id = credentialId;
        credential.typeOfCredential = _credentialTypes;
        credential.issuer = issuerDID;
        credential.issuanceDate = getCurrentTimestampString();
        credential.expirationDate = _expirationDate;
        credential.credentialSubject = _credentialSubject;
        credential.isRevoked = false;

        // Create the proof
        credential.proof = Proof({
            typeOfProof: "EcdsaSecp256k1Signature2019",
            created: getCurrentTimestampString(),
            proofPurpose: "assertionMethod",
            verificationMethod: issuerDID,
            signature: _issuerSignature
        });

        // Verify the signature
        bytes32 credentialHash = keccak256(abi.encode(
            credential.context,
            credential.id,
            credential.typeOfCredential,
            credential.issuer,
            credential.issuanceDate,
            credential.expirationDate,
            credential.credentialSubject
        ));

        bytes32 prefixedHash = credentialHash.toEthSignedMessageHash();
        address recoveredIssuer = prefixedHash.recover(_issuerSignature);
        require(
            recoveredIssuer == msg.sender,
            "Invalid issuer signature"
        );

        emit CredentialIssued(credentialId, issuerDID, _subjectDID, _credentialTypes[0]);
    }

    /**
     * @dev Verifies the authenticity of a verifiable credential.
     * @param credentialId The ID of the credential to verify.
     * @return isValid Returns true if the credential is valid.
     */
    function verifyCredential(
        string memory credentialId
    ) external view credentialExists(credentialId) notRevoked(credentialId) returns (bool isValid) {
        VerifiableCredential memory credential = credentials[credentialId];

        // Reconstruct the credential data hash
        bytes32 credentialHash = keccak256(abi.encode(
            credential.context,
            credential.id,
            credential.typeOfCredential,
            credential.issuer,
            credential.issuanceDate,
            credential.expirationDate,
            credential.credentialSubject
        ));

        bytes32 prefixedHash = credentialHash.toEthSignedMessageHash();

        // Verify the issuer's signature
        address recoveredIssuer = prefixedHash.recover(credential.proof.signature);

        // Get the issuer's address from the DID Document
        DIDDocument memory issuerDoc = didDocuments[credential.issuer];
        require(issuerDoc.exists, "Issuer DID does not exist");
        address expectedIssuerAddress = issuerDoc.owner;

        if (recoveredIssuer != expectedIssuerAddress) {
            return false;
        }

        // Check if the credential has expired
        uint256 expirationTimestamp = parseTimestampString(credential.expirationDate);
        require(block.timestamp <= expirationTimestamp, "Credential has expired");

        return true;
    }

    // =============================
    // ===== Revocation ============
    // =============================

    /**
     * @dev Allows the issuer to revoke an existing credential.
     *      Emits a {CredentialRevoked} event upon success.
     * @param credentialId The ID of the credential to revoke.
     */
    function revokeCredential(string memory credentialId)
        external
        whenNotPaused
        credentialExists(credentialId)
        onlyRegisteredDID
        nonReentrant
    {
        VerifiableCredential storage credential = credentials[credentialId];
        string memory issuerDID = constructDID(msg.sender);
        require(
            keccak256(bytes(credential.issuer)) == keccak256(bytes(issuerDID)),
            "Caller is not the issuer of this credential"
        );
        require(!credential.isRevoked, "Credential is already revoked");

        credential.isRevoked = true;

        emit CredentialRevoked(credentialId);
    }

    // =============================
    // ====== Rating Functions =====
    // =============================

    /**
     * @dev Allows users to rate a resource.
     *      Emits a {ResourceRated} event upon success.
     * @param resourceDID The DID of the resource to rate.
     * @param score The rating score between 1 and 5.
     * @param comment An optional comment.
     */
    function rateResource(
        string memory resourceDID,
        uint8 score,
        string memory comment
    ) external whenNotPaused resourceExists(resourceDID) nonReentrant {
        require(score >= 1 && score <= 5, "Score must be between 1 and 5");

        ResourceRatings storage ratings = resourceRatings[resourceDID];
        require(!ratings.hasRated[msg.sender], "User has already rated this resource");

        ratings.totalScore += score;
        ratings.numberOfRatings += 1;
        ratings.hasRated[msg.sender] = true;

        emit ResourceRated(resourceDID, msg.sender, score, comment);
    }

    /**
     * @dev Retrieves the average rating and total number of ratings for a resource.
     * @param resourceDID The DID of the resource.
     * @return averageRating The average rating (scaled by 100 for decimal representation).
     * @return totalRatings The total number of ratings.
     */
    function getResourceRating(string memory resourceDID)
        external
        view
        resourceExists(resourceDID)
        returns (uint256 averageRating, uint256 totalRatings)
    {
        ResourceRatings storage ratings = resourceRatings[resourceDID];
        if (ratings.numberOfRatings == 0) {
            return (0, 0);
        }
        averageRating = (ratings.totalScore * 100) / ratings.numberOfRatings;
        totalRatings = ratings.numberOfRatings;
    }

    // =============================
    // ======= Utility =============
    // =============================

    /**
     * @dev Retrieves the details of a credential.
     * @param credentialId The ID of the credential.
     * @return The Verifiable Credential associated with the ID.
     */
    function getCredential(string memory credentialId)
        external
        view
        credentialExists(credentialId)
        returns (VerifiableCredential memory)
    {
        return credentials[credentialId];
    }

    /*
     * @dev Converts a uint256 to its ASCII string decimal representation.
     * @param _i The uint256 to convert.
     * @return The string representation.
     */
    function uint2str(uint256 _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint256 temp = _i;
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        while (temp != 0) {
            bstr[--length] = bytes1(uint8(48 + temp % 10));
            temp /= 10;
        }
        return string(bstr);
    }

    /**
     * @dev Gets the current block timestamp as a string.
     * @return The current timestamp as a string.
     */
    function getCurrentTimestampString() internal view returns (string memory) {
        return uint2str(block.timestamp);
    }

    /**
     * @dev Parses a timestamp string to a uint256.
     * @param timestamp The timestamp string to parse.
     * @return The parsed timestamp as uint256.
     */
    function parseTimestampString(string memory timestamp) internal pure returns (uint256) {
        bytes memory b = bytes(timestamp);
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            require(c >= 48 && c <= 57, "Invalid timestamp character");
            result = result * 10 + (c - 48);
        }
        return result;
    }

    // =============================
    // ======= Pausable ============
    // =============================

    /**
     * @dev Pauses all contract functionalities. Can only be called by the contract owner.
     *      Emits a {Paused} event.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpauses all contract functionalities. Can only be called by the contract owner.
     *      Emits an {Unpaused} event.
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
