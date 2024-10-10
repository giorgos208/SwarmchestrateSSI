// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract AdvancedDIDRegistry {
    struct DIDDocument {
        string context;
        string id;
        string[] publicKeys;
        bool isActive;
        uint256 roleID;
    }

    mapping(string => DIDDocument) public didDocuments;
    mapping(string => address) private owners;
    mapping(address => string[]) private issuerCertificates;
    string[] private allDIDs;  // Array to store all DID IDs

    IERC721 public issuerNFT; // NFT contract for issuers

    // Events for logging activities
    event DIDCreated(string indexed id);
    event DIDUpdated(string indexed id);
    event DIDRevoked(string indexed id);

    // Modifier to check if the caller is the owner of the DID
    modifier onlyOwner(string memory id) {
        require(msg.sender == owners[id], "Caller is not the owner");
        _;
    }

    // Modifier to check if the caller is a valid issuer
    modifier onlyIssuer() {
        require(issuerNFT.balanceOf(msg.sender) > 0, "Caller is not a valid issuer");
        _;
    }

    constructor(address _issuerNFT) {
        issuerNFT = IERC721(_issuerNFT);
    }

    // Create a new DID
    function createDID(string memory _publicKey, uint256 _roleID) public onlyIssuer returns (string memory) {
        string memory id = generateDID(_publicKey);
        string[] memory keys = new string[](1);
        keys[0] = _publicKey;

        DIDDocument memory newDocument = DIDDocument({
            context: "https://www.w3.org/ns/did/v1",
            id: id,
            publicKeys: keys,
            isActive: true,
            roleID: _roleID
        });

        didDocuments[id] = newDocument;
        owners[id] = msg.sender;
        issuerCertificates[msg.sender].push(id);
        allDIDs.push(id);

        emit DIDCreated(id);
        return id;
    }

    // Update an existing DID document
    function updateDID(string memory id, string[] memory newPublicKeys, uint256 newRoleID) public onlyOwner(id) {
        require(didDocuments[id].isActive, "DID is not active");
        didDocuments[id].publicKeys = newPublicKeys;
        didDocuments[id].roleID = newRoleID;
        emit DIDUpdated(id);
    }

    // Revoke a DID
    function revokeDID(string memory id) public onlyOwner(id) {
        require(didDocuments[id].isActive, "DID is already inactive");
        didDocuments[id].isActive = false;
        emit DIDRevoked(id);
    }

    // Verify a public key against a DID
    function verifyPublicKey(string memory id, string memory publicKey) public view returns (bool) {
        require(didDocuments[id].isActive, "DID is not active");
        for (uint i = 0; i < didDocuments[id].publicKeys.length; i++) {
            if (keccak256(abi.encodePacked(didDocuments[id].publicKeys[i])) == keccak256(abi.encodePacked(publicKey))) {
                return true;
            }
        }
        return false;
    }

    // Get DIDs associated with a public key
    function getDIDsByPublicKey(string memory publicKey) public view returns (string[] memory) {
        uint count = 0;
        for (uint i = 0; i < allDIDs.length; i++) {
            if (verifyPublicKey(allDIDs[i], publicKey)) {
                count++;
            }
        }

        string[] memory result = new string[](count);
        uint index = 0;
        for (uint i = 0; i < allDIDs.length; i++) {
            if (verifyPublicKey(allDIDs[i], publicKey)) {
                result[index] = allDIDs[i];
                index++;
            }
        }

        return result;
    }

    // Helper functions
    function generateDID(string memory _publicKey) private view returns (string memory) {
        bytes32 didHash = keccak256(abi.encodePacked(block.timestamp, msg.sender, _publicKey));
        return string(abi.encodePacked("did:eth:", toHexString(didHash)));
    }

    function toHexString(bytes32 _bytes) private pure returns (string memory) {
        bytes memory buffer = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            buffer[i*2] = byteToHexChar(uint8(_bytes[i] >> 4));
            buffer[i*2+1] = byteToHexChar(uint8(_bytes[i] & 0x0F));
        }
        return string(buffer);
    }
    
    function byteToHexChar(uint8 _byte) private pure returns (bytes1) {
        if (_byte < 10) return bytes1(uint8(_byte + 48)); // Handles 0-9 by converting them to ASCII '0' to '9'
        else return bytes1(uint8(_byte + 87)); // Handles 10-15 by converting them to ASCII 'a' to 'f'
    }
}
