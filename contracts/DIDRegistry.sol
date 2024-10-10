// contracts/DIDRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DIDRegistry {
    struct DIDDocument {
        address owner;
        address publicKey;
        bool exists;
    }

    // Use bytes32 instead of string for DIDs to optimize storage and gas costs
    mapping(bytes32 => DIDDocument) public resourceOwners;
    mapping(bytes32 => DIDDocument) public resources;
    mapping(bytes32 => bool) public revokedCredentials;

    event ResourceOwnerRegistered(bytes32 indexed did, address owner);
    event ResourceRegistered(bytes32 indexed did, address owner);
    event CredentialRevoked(bytes32 credentialHash);

    constructor() {}

    // Register a new Resource Owner with associated public key (wallet address)
    function registerResourceOwner(bytes32 did, address publicKey) public {
        require(!resourceOwners[did].exists, "Resource Owner already registered");
        require(publicKey != address(0), "Public key cannot be zero address");
        require(did != bytes32(0), "DID cannot be zero");

        resourceOwners[did] = DIDDocument({
            owner: msg.sender,
            publicKey: publicKey,
            exists: true
        });

        emit ResourceOwnerRegistered(did, msg.sender);
    }

    // Register a new Resource with associated public key (wallet address)
    function registerResource(bytes32 did, address publicKey) public {
        require(!resources[did].exists, "Resource already registered");
        require(publicKey != address(0), "Public key cannot be zero address");
        require(did != bytes32(0), "DID cannot be zero");

        resources[did] = DIDDocument({
            owner: msg.sender,
            publicKey: publicKey,
            exists: true
        });

        emit ResourceRegistered(did, msg.sender);
    }

    // Retrieve the public key associated with a Resource Owner or Resource
    function getPublicKey(bytes32 did, bool isResourceOwner) public view returns (address) {
        if (isResourceOwner) {
            require(resourceOwners[did].exists, "Resource Owner not registered");
            return resourceOwners[did].publicKey;
        } else {
            require(resources[did].exists, "Resource not registered");
            return resources[did].publicKey;
        }
    }

    // Revoke a credential by its hash
    function revokeCredential(bytes32 credentialHash) public {
        revokedCredentials[credentialHash] = true;
        emit CredentialRevoked(credentialHash);
    }

    // Check if a credential is revoked
    function isCredentialRevoked(bytes32 credentialHash) public view returns (bool) {
        return revokedCredentials[credentialHash];
    }
}
