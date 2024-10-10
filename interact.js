require('dotenv').config();
const Web3 = require('web3');
const contract = require('@truffle/contract');
const HDWalletProvider = require('@truffle/hdwallet-provider');
const AdvancedDIDRegistryArtifact = require('./build/contracts/AdvancedDIDRegistry.json');
const IssuerNFTArtifact = require('./build/contracts/IssuerNFT.json');

// Replace with your own values
const PROVIDER_URL = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const DID_CONTRACT_ADDRESS = '0x1555ed353a33641E94e377276586B6c05220a309'; // AdvancedDIDRegistry contract address
const ISSUER_NFT_ADDRESS = '0xE07669400F06813ed55EAD0Ef9107F9b84c463c5'; // IssuerNFT contract address
const MNEMONIC = process.env.MNEMONIC;

// Use HDWalletProvider to create a new provider
const provider = new HDWalletProvider({
    mnemonic: {
        phrase: MNEMONIC
    },
    providerOrUrl: PROVIDER_URL
});

const web3 = new Web3(provider);

// Create the contract instances
const AdvancedDIDRegistry = contract(AdvancedDIDRegistryArtifact);
const IssuerNFT = contract(IssuerNFTArtifact);
AdvancedDIDRegistry.setProvider(web3.currentProvider);
IssuerNFT.setProvider(web3.currentProvider);

// Interacting with the contract
async function interact() {
    try {
        const accounts = await web3.eth.getAccounts();
        const owner = accounts[0];

        // Get the deployed contract instances
        const didRegistryInstance = await AdvancedDIDRegistry.at(DID_CONTRACT_ADDRESS);
        const issuerNFTInstance = await IssuerNFT.at(ISSUER_NFT_ADDRESS);

        console.log(`Owner Account: ${owner}`);

        // Example: Mint a new NFT of type Resource or Agent
        const tokenId = 5;  // Use a new tokenId
        const nftType = 0;  // 0 = Resource, 1 = Agent
        try {
            const mintNFTTx = await issuerNFTInstance.mint(owner, tokenId, nftType, { from: owner });
            console.log('NFT Minted:', mintNFTTx);
        } catch (error) {
            console.error('Error minting NFT:', error.message);
        }

        // Example: Create a new DID with a Resource or Agent NFT
        const publicWallets = ['0x1234567890abcdef1234567890abcdef12345678']; // Example wallet address array
        const roleID = 1;
        const subtypeID = 1;  // 1 = Resource subtype, 2 = Agent subtype (should match the NFT type)
        let didID;
        try {
            const createDIDTx = await didRegistryInstance.createDID(publicWallets, roleID, subtypeID, tokenId, { from: owner });
            console.log('CreateDID Transaction:', createDIDTx);
            didID = createDIDTx.logs[0].args.id;
            console.log('DID Created:', didID);
        } catch (error) {
            console.error('Error creating DID:', error.message);
        }

        // Retrieve and log the owner of the created DID
        try {
            const didOwner = await didRegistryInstance.getOwnerOfDID(didID); // Use the getter function
            console.log(`Owner of DID ${didID}: ${didOwner}`);
        } catch (error) {
            console.error('Error fetching DID owner:', error.message);
        }

        // Example: Update an existing DID
        if (didID) {
            const newPublicWallets = ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'];
            const newRoleID = 2;
            try {
                const updateDIDTx = await didRegistryInstance.updateDID(didID, newPublicWallets, newRoleID, tokenId, { from: owner });
                console.log('DID Updated:', updateDIDTx);
            } catch (error) {
                console.error('Error updating DID:', error.message);
            }

            // Example: Revoke a DID
            try {
                const revokeDIDTx = await didRegistryInstance.revokeDID(didID, tokenId, { from: owner });
                console.log('DID Revoked:', revokeDIDTx);
            } catch (error) {
                console.error('Error revoking DID:', error.message);
            }

            // Example: Verify a public wallet address against a DID
            try {
                const isValid = await didRegistryInstance.verifyPublicWallet(didID, publicWallets[0]);
                console.log('Is Valid Public Wallet:', isValid);
            } catch (error) {
                console.error('Error verifying public wallet:', error.message);
            }
        }

        // Example: Get DIDs by public wallet address
        try {
            const dids = await didRegistryInstance.getDIDsByPublicWallet(publicWallets[0]);
            console.log('DIDs for Public Wallet:', dids);
        } catch (error) {
            console.error('Error getting DIDs:', error.message);
        }
    } catch (error) {
        console.error('Error interacting with the contract:', error.message);
    } finally {
        provider.engine.stop(); // Ensure the provider is properly closed
    }
}

interact();
