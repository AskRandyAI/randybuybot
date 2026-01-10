const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const logger = require('../utils/logger');

function getConnection() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
        throw new Error('SOLANA_RPC_URL not set in .env');
    }
    return new Connection(rpcUrl, 'confirmed');
}

function getDepositPublicKey() {
    const address = process.env.DEPOSIT_WALLET_ADDRESS;
    if (!address) {
        throw new Error('DEPOSIT_WALLET_ADDRESS not set in .env');
    }
    return new PublicKey(address);
}

function getDepositKeypair() {
    const privateKey = process.env.DEPOSIT_WALLET_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('DEPOSIT_WALLET_PRIVATE_KEY not set in .env');
    }
    
    try {
        const base58 = require('bs58');
        let decoded;
        
        if (typeof base58.decode === 'function') {
            decoded = base58.decode(privateKey);
        } else if (base58.default && typeof base58.default.decode === 'function') {
            decoded = base58.default.decode(privateKey);
        } else {
            throw new Error('bs58 decode not available');
        }
        
        return Keypair.fromSecretKey(new Uint8Array(decoded));
    } catch (error) {
        logger.error('Error loading deposit wallet keypair:', error);
        throw new Error('Invalid DEPOSIT_WALLET_PRIVATE_KEY format: ' + error.message);
    }
}

function lamportsToSol(lamports) {
    return lamports / 1000000000;
}

function solToLamports(sol) {
    return Math.floor(sol * 1000000000);
}

module.exports = {
    getConnection,
    getDepositPublicKey,
    getDepositKeypair,
    lamportsToSol,
    solToLamports
};