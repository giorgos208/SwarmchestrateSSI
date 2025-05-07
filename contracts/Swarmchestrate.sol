// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Swarmchestrate (On-chain Universe Registration, On-chain DID registration, Off-Chain Credential Issuance)
 * @dev Manages:
 *       - DIDs (on-chain registration),
 *       - On-demand verification of **off-chain** credentials,
 *       - Simple on-chain revocation references,
 *       - Direct rating of DID providers (0..10).
 *
 *  Off-chain Credential Flow:
 *   1) The issuer (DID) signs the credential **off chain**—no storage on chain.
 *   2) The only time the blockchain is used is if:
 *      - You need to check revocation (via a hash),
 *      - You want to do an **on-chain** verification (verifyOffChainCredential),
 *      - or you want to revoke the credential (revokeOffChainCredential).
 */
contract Swarmchestrate is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ----------------------------
    // DID Constants
    // ----------------------------
    uint256 constant DID_CONTEXT = 1; //For capacity providers

    // ----------------------------
    // DID Structures
    // ----------------------------
    struct VerificationMethod {
        uint256 id;
        uint256 typeOfKey;
        uint256 controller;
        bytes publicKeyMultibase;
    }

    struct Service {
        uint256 id;
        uint256 typeOfService;
        string serviceEndpoint;
    }

    struct DIDDocument {
    uint256 context;
    uint256 id;
    VerificationMethod[] verificationMethod;
    uint256[] authentication;
    Service[] service;
    address owner;
    bool exists;

    mapping(bytes32 => bool) revokedCredentials;
}


    // ----------------------------
    // Provider Single-Score Rating
    // ----------------------------
    struct ProviderSingleScore {
        uint256 totalScore;      // sum of votes
        uint256 numberOfRatings; // how many votes
    }

    // ----------------------------
    // Universe Structure
    // ----------------------------
    struct Universe {
    uint256 id;
    address publicKey;

    mapping(address => uint256) addressToDID;     // userAddress -> DID
    mapping(uint256 => DIDDocument) didDocuments; // DID -> DIDDocument

    // REMOVE this:
    // mapping(bytes32 => bool) revokedCredentials;

    // Single-score aggregator for providers: DID -> ProviderSingleScore
    mapping(uint256 => ProviderSingleScore) providerScores;

    bool exists;
}


    // ----------------------------
    // State
    // ----------------------------
    mapping(uint256 => Universe) public universes;

    uint256 public universeCount;
    uint256 public didCount;

    // ----------------------------
    // Events
    // ----------------------------
    // Universe / DID
    event UniverseRegistered(uint256 indexed universeId, address indexed publicKey);
    event DIDRegistered(uint256 indexed universeId, uint256 indexed did);
    event DIDMappingSet(address indexed account, uint256 didId);
    event DIDUpdated(uint256 indexed universeId, uint256 indexed did);
    event DIDDeactivated(uint256 indexed universeId, uint256 indexed did);

    // Off-chain Credential Revocation
    event OffChainCredentialRevoked(
        uint256 indexed universeId,
        bytes32 indexed credentialHash
    );

    // Provider rating
    event ProviderRated(
        uint256 indexed universeId,
        uint256 indexed providerDID,
        uint8 vote,
        uint256 newTotalScore,
        uint256 totalVotes
    );

    // ----------------------------
    // Modifiers
    // ----------------------------
    modifier universeExists(uint256 universeId) {
        require(universes[universeId].exists, "Universe does not exist");
        _;
    }

    modifier onlyRegisteredDID(uint256 universeId) {
        require(universes[universeId].exists, "Universe does not exist");
        Universe storage universe = universes[universeId];
        require(universe.addressToDID[msg.sender] != 0, "Caller not a registered DID in this universe");
        _;
    }

    modifier onlyUniverse(uint256 universeId) {
        require(universes[universeId].exists, "Universe does not exist");
        require(universes[universeId].publicKey == msg.sender, "Only this universe's publicKey can call");
        _;
    }

    // =============================
    // ======= Universe Logic ======
    // =============================
    function registerUniverse(address publicKey)
        external
        whenNotPaused
        returns (uint256 universeId)
    {
        require(publicKey != address(0), "Invalid public key");
        universeCount++;
        universeId = universeCount;

        Universe storage universe = universes[universeId];
        universe.id = universeId;
        universe.publicKey = publicKey;
        universe.exists = true;

        emit UniverseRegistered(universeId, publicKey);
        return universeId;
    }

    // =============================
    // ======== DID Logic ==========
    // =============================
    function registerDID(
        uint256 universeId,
        VerificationMethod[] memory _verificationMethods,
        uint256[] memory _authentications,
        Service[] memory _services
    )
        external
        whenNotPaused
        universeExists(universeId)
        returns (uint256 did)
    {
        Universe storage universe = universes[universeId];
        require(universe.addressToDID[msg.sender] == 0, "DID already registered in this universe");

        didCount++;
        did = didCount;

        DIDDocument storage doc = universe.didDocuments[did];
        doc.context = DID_CONTEXT;
        doc.id = did;
        doc.owner = msg.sender;
        doc.exists = true;

        for (uint256 i = 0; i < _verificationMethods.length; i++) {
            doc.verificationMethod.push(_verificationMethods[i]);
        }
        for (uint256 i = 0; i < _authentications.length; i++) {
            doc.authentication.push(_authentications[i]);
        }
        for (uint256 i = 0; i < _services.length; i++) {
            doc.service.push(_services[i]);
        }

        universe.addressToDID[msg.sender] = did;

        emit DIDMappingSet(msg.sender, did);
        emit DIDRegistered(universeId, did);
        return did;
    }

    function getDIDId(uint256 universeId, address userAddress)
        external
        view
        universeExists(universeId)
        returns (uint256)
    {
        Universe storage universe = universes[universeId];
        return universe.addressToDID[userAddress];
    }

    // ============================================================
    // == Off-Chain Credential Logic (Issue Off-Chain, Verify On-Chain)
    // ============================================================

    /**
     * @dev Revoke a previously issued off-chain credential by its hash.
     *
     * Requirements:
     *   - The caller must pass in data proving they are the off-chain issuer:
     *       - `issuerAddress`, `signature`, `expirationDate`.
     *   - The off-chain credential must be signed by `issuerAddress`.
     *   - `msg.sender` must be `issuerAddress`.
     *   - The issuer must be a registered DID in this universe.
     *
     * The `credentialHash` should be the keccak256 of all relevant fields
     * from the off-chain credential so it's globally unique.
     */
    function revokeOffChainCredential(
    uint256 universeId,
    bytes32 credentialHash,
    address issuerAddress,
    bytes memory signature,
    uint256 expirationDate
)
    external
    whenNotPaused
    universeExists(universeId)
    nonReentrant
{
    Universe storage universe = universes[universeId];

    // 1) Ensure issuerAddress is a registered DID in this universe
    uint256 issuerDID = universe.addressToDID[issuerAddress];
    require(issuerDID != 0, "Issuer is not a registered DID in this universe");

    // 2) Check that the credential hasn't expired
    require(block.timestamp <= expirationDate, "Credential is expired");

    // 3) Reconstruct ECDSA signature to confirm issuerAddress signed the credential
    address recovered = credentialHash.toEthSignedMessageHash().recover(signature);
    require(recovered == issuerAddress, "Signature mismatch");

    // 4) Ensure the caller is the issuer
    require(msg.sender == issuerAddress, "Only the credential issuer can revoke");

    // Mark as revoked **in the DIDDocument** rather than Universe
    DIDDocument storage doc = universe.didDocuments[issuerDID];
    doc.revokedCredentials[credentialHash] = true;

    emit OffChainCredentialRevoked(universeId, credentialHash);
}


    /**
     * @dev Verify an off-chain credential on demand. This does NOT store
     *      anything in state. It simply returns true or false.
     *
     * Arguments might include:
     *   - credentialHash: keccak256(...) of the entire credential or
     *                     a canonical representation
     *   - issuerAddress:  address that must match the signature
     *   - signature:      ECDSA signature over the credentialHash
     *   - expirationDate: a unix timestamp; we check if block.timestamp <= expirationDate
     *
     * The caller must pass enough data so the contract can re-check the signature
     * using ECDSA.recover. If you do "eth_signedMessage", you'd do:
     *   address recovered = credentialHash.toEthSignedMessageHash().recover(signature);
     *
     * Additionally, we check:
     *   - The issuerAddress is a DID in this universe
     *   - The credential is not revoked (by credentialHash)
     *   - The current time hasn't passed the expirationDate
     */
    function verifyOffChainCredential(
    uint256 universeId,
    bytes32 credentialHash,
    address issuerAddress,
    bytes memory signature,
    uint256 expirationDate
)
    external
    view
    universeExists(universeId)
    returns (bool)
{
    Universe storage universe = universes[universeId];

    // 1) Check issuer's DID in this universe
    uint256 issuerDID = universe.addressToDID[issuerAddress];
    if (issuerDID == 0) {
        return false; // Not registered
    }

    // 2) Check if the DID has revoked this credential
    DIDDocument storage doc = universe.didDocuments[issuerDID];
    if (doc.revokedCredentials[credentialHash]) {
        return false; // It's revoked
    }

    // 3) Check expiration
    if (block.timestamp > expirationDate) {
        return false; // Already expired
    }

    // 4) Reconstruct ECDSA signature
    address recovered = credentialHash.toEthSignedMessageHash().recover(signature);
    if (recovered != issuerAddress) {
        return false; // Signature mismatch
    }

    // All checks passed
    return true;
}


    // =============================
    // ===== PROVIDER SCORE LOGIC ==
    // =============================

    /**
     * @dev Allows the Universe publicKey to vote for multiple DID providers
     *      in a single transaction. Each vote is in the [0..10] range.
     */
    function voteProviders(
        uint256 universeId,
        uint256[] memory providerDIDs,
        uint8[] memory votes
    )
        external
        whenNotPaused
        universeExists(universeId)
        onlyUniverse(universeId)
        nonReentrant
    {
        require(providerDIDs.length == votes.length, "Arrays must have same length");

        Universe storage universe = universes[universeId];

        for (uint256 i = 0; i < providerDIDs.length; i++) {
            require(votes[i] <= 10, "Vote must be 0..10");
            ProviderSingleScore storage score = universe.providerScores[providerDIDs[i]];

            score.totalScore += votes[i];
            score.numberOfRatings++;

            emit ProviderRated(
                universeId,
                providerDIDs[i],
                votes[i],
                score.totalScore,
                score.numberOfRatings
            );
        }
    }

    /**
     * @dev Retrieve a provider's aggregated score. The final average is:
     *      `totalScore / numberOfRatings` (each 0..10).
     *      We return average * 100 (e.g. 750 => 7.50) and totalVotes.
     */
    function getProviderScore(
        uint256 universeId,
        uint256 providerDID
    )
        external
        view
        returns (uint256 scaledAverage, uint256 totalVotes)
    {
        Universe storage universe = universes[universeId];
        ProviderSingleScore storage ps = universe.providerScores[providerDID];
        totalVotes = ps.numberOfRatings;

        if (totalVotes == 0) {
            return (0, 0);
        }
        scaledAverage = (ps.totalScore * 100) / totalVotes; // e.g. 750 => 7.50. This non-decimals conversion logic is meant to be interpreted off-chain.
    }

    // Pausing
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
