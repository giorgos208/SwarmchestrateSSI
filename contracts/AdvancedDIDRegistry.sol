// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol"; // Importing OpenZeppelin Strings utility
import "./IssuerNFT.sol";  

contract AdvancedDIDRegistry {
    struct DIDDocument {
        string context;
        string id;
        address[] publicWallets;  // Array to store associated wallet addresses (public keys)
        bool isActive;
        uint256 roleID;
        uint256 subtypeID; 
        uint256 creatorTokenId; // Stores the NFT token ID of the DID creator (issuer)
    }

    mapping(string => DIDDocument) public didDocuments;
    mapping(string => address) private owners;
    mapping(address => string[]) private issuerCertificates;
    string[] private allDIDs;  // Array to store all DID IDs

    IssuerNFT public issuerNFT; // Updated to use the more complex NFT contract

    // Events for logging activities
    event DIDCreated(string indexed id, uint256 indexed subtypeID);
    event DIDUpdated(string indexed id);
    event DIDRevoked(string indexed id);

    // Modifier to check if the caller is the original issuer (creator) of the DID using the token ID
    modifier onlyIssuer(string memory id, uint256 tokenId) {
        require(didDocuments[id].creatorTokenId == tokenId, "Caller is not the creator of this DID");
        require(issuerNFT.ownerOf(tokenId) == msg.sender, "Caller does not own the issuer NFT");
        _;
    }

    constructor(address _issuerNFT) {
        issuerNFT = IssuerNFT(_issuerNFT);
    }

    // Create a new DID with a subtype (0 = default, 1 = subtype A, 2 = subtype B, etc.)
    function createDID(address[] memory _publicWallets, uint256 _roleID, uint256 subtypeID, uint256 tokenId) public returns (string memory) {
        // Check NFT type (Resource or Agent) before allowing DID issuance
        (IssuerNFT.NFTType nftType, ) = issuerNFT.getNFTDetails(tokenId);
        require((nftType == IssuerNFT.NFTType.Resource && subtypeID == 1) || (nftType == IssuerNFT.NFTType.Agent && subtypeID == 2), 
                "Invalid DID type for this NFT");

        string memory id = generateDID(_publicWallets[0]); // Use the first wallet address as the DID identifier
        DIDDocument memory newDocument = DIDDocument({
            context: "https://www.w3.org/ns/did/v1",
            id: id,
            publicWallets: _publicWallets,
            isActive: true,
            roleID: _roleID,
            subtypeID: subtypeID,
            creatorTokenId: tokenId
        });

        didDocuments[id] = newDocument;
        owners[id] = msg.sender;
        issuerCertificates[msg.sender].push(id);
        allDIDs.push(id);

        // Increment DID count for the issuer NFT
        issuerNFT.incrementDIDCount(tokenId);

        emit DIDCreated(id, subtypeID);
        return id;
    }

    // Update an existing DID document (restricted to the original creator issuer)
    function updateDID(string memory id, address[] memory newPublicWallets, uint256 newRoleID, uint256 tokenId) public onlyIssuer(id, tokenId) {
        require(didDocuments[id].isActive, "DID is not active");
        didDocuments[id].publicWallets = newPublicWallets;
        didDocuments[id].roleID = newRoleID;
        emit DIDUpdated(id);
    }

    // Revoke a DID (restricted to the original creator issuer)
    function revokeDID(string memory id, uint256 tokenId) public onlyIssuer(id, tokenId) {
        require(didDocuments[id].isActive, "DID is already inactive");
        didDocuments[id].isActive = false;
        emit DIDRevoked(id);
    }

    // Verify a public wallet (also acting as a public key) against a DID
    function verifyPublicWallet(string memory id, address publicWallet) public view returns (bool) {
        require(didDocuments[id].isActive, "DID is not active");
        for (uint i = 0; i < didDocuments[id].publicWallets.length; i++) {
            if (didDocuments[id].publicWallets[i] == publicWallet) {
                return true;
            }
        }
        return false;
    }

    // Get DIDs associated with a public wallet address
    function getDIDsByPublicWallet(address publicWallet) public view returns (string[] memory) {
        uint count = 0;
        for (uint i = 0; i < allDIDs.length; i++) {
            if (verifyPublicWallet(allDIDs[i], publicWallet)) {
                count++;
            }
        }

        string[] memory result = new string[](count);
        uint index = 0;
        for (uint i = 0; i < allDIDs.length; i++) {
            if (verifyPublicWallet(allDIDs[i], publicWallet)) {
                result[index] = allDIDs[i];
                index++;
            }
        }

        return result;
    }

    // Helper functions
    function generateDID(address publicWallet) private view returns (string memory) {
        bytes32 didHash = keccak256(abi.encodePacked(block.timestamp, msg.sender, publicWallet));
        return string(abi.encodePacked("did:eth:", Strings.toHexString(uint256(didHash), 32)));
    }
}
