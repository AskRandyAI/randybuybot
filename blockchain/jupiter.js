const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

// Trying a different endpoint that might have better DNS resolution
// Using official v6 API for maximum stability with Token-2022
const JUPITER_API = 'https://quote-api.jup.ag/v6';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Increased default slippage to 10% (1000 bps) to handle new/volatile tokens
async function getQuote(inputMint, outputMint, amountLamports) {
    try {
        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amountLamports.toString(),
            autoSlippage: 'true',
            maxAutoSlippageBps: '1500', // Allow up to 15% slippage automatically for volatile tokens
            onlyDirectRoutes: 'false',
            asLegacyTransaction: 'false'
        });

        const response = await fetch(`${JUPITER_API}/quote?${params}`);

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Jupiter quote failed (${response.status})`;
            try {
                const errJson = JSON.parse(errorText);
                if (errJson.errorCode === 'TOKEN_NOT_TRADABLE') {
                    errorMessage = "This token is not yet tradable on Raydium/Jupiter. Try again in a minute!";
                } else if (errJson.error) {
                    errorMessage = errJson.error;
                }
            } catch (e) { }
            throw new Error(errorMessage);
        }

        const quote = await response.json();
        if (!quote || quote.error) {
            throw new Error(`Jupiter quote error: ${quote?.error || 'Unknown error'}`);
        }

        return quote;

    } catch (error) {
        logger.error('Error getting Jupiter quote:', error);
        throw error;
    }
}

async function executeSwap(quote, userPublicKey) {
    try {
        const connection = getConnection();
        const depositKeypair = getDepositKeypair();

        const swapResponse = await fetch(`${JUPITER_API}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: depositKeypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            })
        });

        if (!swapResponse.ok) {
            throw new Error(`Jupiter swap failed: ${swapResponse.statusText}`);
        }

        const { swapTransaction } = await swapResponse.json();

        if (!swapTransaction) {
            throw new Error('No swap transaction returned from Jupiter');
        }

        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        transaction.sign([depositKeypair]);

        const signature = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            maxRetries: 3
        });

        logger.info(`Swap transaction sent: ${signature}`);

        const confirmation = await connection.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        logger.info(`Swap transaction confirmed: ${signature}`);

        return {
            signature,
            inputAmount: lamportsToSol(quote.inAmount),
            outputAmount: Number(quote.outAmount),
            outputMint: quote.outputMint
        };

    } catch (error) {
        logger.error('Error executing swap:', error);
        throw error;
    }
}

async function buyTokens(tokenMint, amountSOL, slippageBps = 300) {
    try {
        logger.info(`Buying ${amountSOL} SOL worth of ${tokenMint}`);

        const amountLamports = solToLamports(amountSOL);

        const quote = await getQuote(
            WSOL_MINT,
            tokenMint,
            amountLamports,
            slippageBps
        );

        logger.info(`Quote received: ${lamportsToSol(quote.inAmount)} SOL → ${quote.outAmount} tokens`);

        const result = await executeSwap(quote);

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
        const info = await connection.getAccountInfo(new PublicKey(mintAddress));
        if (info && info.owner) {
            return info.owner;
        }
        // Fallback to standard Token Program if not found (likely won't happen if mint is valid)
        return new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    } catch (error) {
        logger.error(`Error detecting program ID for ${mintAddress}:`, error);
        return new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    }
}

async function transferTokens(tokenMint, amount, destinationWallet) {
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
        const depositKeypair = getDepositKeypair();

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