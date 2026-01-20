const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

const JUPITER_API_PUBLIC = 'https://api.jup.ag';
const JUPITER_API_V6 = 'https://api.jup.ag/v6';
const JUPITER_API_ULTRA = 'https://api.jup.ag/ultra/v1';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const { createJupiterApiClient } = require('@jup-ag/api');

async function getQuote(inputMint, outputMint, amountLamports, slippageBps = 1000) {
    try {
        const jupiterQuoteApi = createJupiterApiClient();

        logger.info(`[DIAG-J1] Fetching quote from SDK for ${amountLamports} lamports...`);

        const quote = await jupiterQuoteApi.quoteGet({
            inputMint,
            outputMint,
            amount: Number(amountLamports),
            slippageBps,
            onlyDirectRoutes: false,
            asLegacyTransaction: false
        });

        if (!quote) {
            throw new Error('Jupiter SDK returned empty quote');
        }

        return quote;

    } catch (error) {
        logger.error('Error getting Jupiter quote via SDK:', error);
        throw error;
    }
}

async function executeSwap(quote, userKeypair = null) {
    try {
        const connection = getConnection();
        const depositKeypair = userKeypair || getDepositKeypair();
        const jupiterQuoteApi = createJupiterApiClient();

        // 1. Get swap transaction
        const swapResult = await jupiterQuoteApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: depositKeypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true
            }
        });

        if (!swapResult || !swapResult.swapTransaction) {
            throw new Error('Jupiter SDK failed to generate swap transaction');
        }

        // 2. Deserialize and sign
        const transactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuf);
        transaction.sign([depositKeypair]);

        // 3. Send and confirm
        const signature = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            maxRetries: 3
        });

        await connection.confirmTransaction(signature, 'confirmed');

        return {
            signature,
            inputAmount: lamportsToSol(quote.inAmount),
            outputAmount: Number(quote.outAmount),
            outputMint: quote.outputMint
        };

    } catch (error) {
        logger.error('Error executing swap via SDK:', error);
        throw error;
    }
}


async function buyTokens(tokenMint, amountSOL, slippageBps = 300, userKeypair = null) {
    try {
        logger.info(`Buying ${amountSOL} SOL worth of ${tokenMint}`);

        const amountLamports = solToLamports(amountSOL);

        const quote = await getQuote(
            WSOL_MINT,
            tokenMint,
            amountLamports,
            slippageBps,
            userKeypair
        );

        logger.info(`Quote received: ${lamportsToSol(quote.inAmount)} SOL → ${quote.outAmount} tokens`);

        const result = await executeSwap(quote, userKeypair);

        logger.info(`✅ Swap successful! Got ${result.outputAmount} tokens`);

        return result;

    } catch (error) {
        logger.error('Error buying tokens:', error);
        throw error;
    }
}


async function getTokenProgramId(mintAddress) {
    try {
        const connection = getConnection();
        const mintPubkey = new PublicKey(mintAddress);

        // Increased retries for new launches
        let info = null;
        for (let i = 0; i < 5; i++) {
            info = await connection.getAccountInfo(mintPubkey);
            if (info) break;
            logger.debug(`[DEB] Mint info not found for ${mintAddress}, retry ${i + 1}/5...`);
            await new Promise(r => setTimeout(r, 1000));
        }

        if (info && info.owner) {
            logger.info(`[DEB] Detected Program for ${mintAddress}: ${info.owner.toString()}`);
            return info.owner;
        }

        logger.warn(`Could not detect program for ${mintAddress} after 5 retries, defaulting to Standard Token Program.`);
        return new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    } catch (error) {
        logger.error(`Error detecting program ID for ${mintAddress}:`, error);
        return new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    }
}

async function transferTokens(tokenMint, amount, destinationWallet, userKeypair = null) {
    try {
        const {
            getAssociatedTokenAddress,
            createTransferInstruction,
            createAssociatedTokenAccountInstruction,
            getAccount,
            TOKEN_PROGRAM_ID,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        } = require('@solana/spl-token');

        const connection = getConnection();
        const depositKeypair = userKeypair || getDepositKeypair();

        const mintPublicKey = new PublicKey(tokenMint);
        const destinationPublicKey = new PublicKey(destinationWallet);

        // --- NEW: Detect if this is Token-2022 or Standard ---
        const programId = await getTokenProgramId(tokenMint);
        logger.info(`Token Program Detected: ${programId.toString()}`);

        // 1. Get Source Account (Bot's Wallet)
        const fromTokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            depositKeypair.publicKey,
            false,
            programId,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // 2. Get Destination Account (User's Wallet)
        const toTokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            destinationPublicKey,
            false,
            programId,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const transaction = new (require('@solana/web3.js').Transaction)();

        // 3. Check if Destination Account exists
        try {
            await getAccount(connection, toTokenAccount, 'confirmed', programId);
        } catch (error) {
            // If account not found, create it
            logger.info(`Destination ATA missing for ${tokenMint}. Creating it...`);
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    depositKeypair.publicKey, // Payer
                    toTokenAccount, // ATA
                    destinationPublicKey, // Owner
                    mintPublicKey, // Mint
                    programId // Dynamic Program ID
                )
            );
        }

        // 4. Create Transfer Instruction
        const transferIx = createTransferInstruction(
            fromTokenAccount,
            toTokenAccount,
            depositKeypair.publicKey,
            amount,
            [],
            programId
        );

        transaction.add(transferIx);

        // 5. Send
        const signature = await connection.sendTransaction(
            transaction,
            [depositKeypair],
            { skipPreflight: false }
        );

        await connection.confirmTransaction(signature, 'confirmed');

        logger.info(`✅ Tokens transferred to ${destinationWallet}: ${signature}`);

        return signature;

    } catch (error) {
        logger.error('Error transferring tokens:', error);
        throw error;
    }
}


module.exports = {
    buyTokens,
    transferTokens,
    getQuote,
    getTokenProgramId
};