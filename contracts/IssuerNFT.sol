// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IssuerNFT is ERC721, Ownable {
    // Define the types of NFTs (Resource or Agent)
    enum NFTType { Resource, Agent }

    // Mapping to track the type of each NFT (Resource or Agent)
    mapping(uint256 => NFTType) public nftTypes;

    // Mapping to track the number of DIDs issued by each NFT
    mapping(uint256 => uint256) public didCount;

    // Hardcode the name and symbol in the constructor
    constructor() ERC721("IssuerNFT", "ISFT") {}

    // Mint an NFT of a specific type (Resource or Agent)
    function mint(address to, uint256 tokenId, NFTType nftType) external onlyOwner {
        _safeMint(to, tokenId);
        nftTypes[tokenId] = nftType;
        didCount[tokenId] = 0;
    }

    // Function to increment DID count for a given NFT when a DID is created
    function incrementDIDCount(uint256 tokenId) external {
        require(_exists(tokenId), "NFT does not exist");
        didCount[tokenId] += 1;
    }

    // Function to retrieve both the type and DID count for a specific NFT
    function getNFTDetails(uint256 tokenId) external view returns (NFTType, uint256) {
        require(_exists(tokenId), "NFT does not exist");
        return (nftTypes[tokenId], didCount[tokenId]);
    }

    // Function to retrieve the NFT type (Resource or Agent) for a specific tokenId
    function getNFTType(uint256 tokenId) external view returns (NFTType) {
        require(_exists(tokenId), "NFT does not exist");
        return nftTypes[tokenId];
    }
}
