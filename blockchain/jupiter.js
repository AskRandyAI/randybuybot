const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

// Trying a different endpoint that might have better DNS resolution
// Reverting to public.jupiterapi.com for DNS stability on Digital Ocean
const JUPITER_API = 'https://public.jupiterapi.com';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Increased default slippage to 10% (1000 bps) to handle new/volatile tokens
async function getQuote(inputMint, outputMint, amountLamports) {
    try {
        const { getDepositKeypair } = require('./wallet');
        const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const wallet = getDepositKeypair().publicKey;
        const programId = await getTokenProgramId(outputMint);

        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amountLamports.toString(),
            autoSlippage: 'true',
            maxAutoSlippageBps: '2000',
            onlyDirectRoutes: 'true',
            asLegacyTransaction: 'false', // Versioned transactions are better for T2022
            userPublicKey: wallet.toString()
        });
        logger.info(`[DEB] Quote Params: ${params.toString()}`);
        logger.info(`[DEB] Quote Params: ${params.toString()}`);

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
        if (quote.error) {
            throw new Error(`Jupiter quote error: ${quote?.error || 'Unknown error'}`);
        }

        logger.info(`[DEB] Full Quote: ${JSON.stringify(quote)}`);
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

        const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const programId = await getTokenProgramId(quote.outputMint);
        logger.info(`[DEB] Token: ${quote.outputMint}, Program: ${programId.toString()}`);

        const destinationTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(quote.outputMint),
            depositKeypair.publicKey,
            false,
            programId,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        logger.info(`[DEB] Derived ATA: ${destinationTokenAccount.toString()}`);

        const swapResponse = await fetch(`${JUPITER_API}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'RandyBuyBot/1.0'
            },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: depositKeypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                useSharedAccounts: false,
                prioritizationFeeLamports: 'auto',
                destinationTokenAccount: destinationTokenAccount.toString()
            })
        });

        if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            throw new Error(`Jupiter swap error (${swapResponse.status}): ${errorText}`);
        }

        const swapData = await swapResponse.json();
        const { swapTransaction } = swapData;

        if (!swapTransaction) {
            throw new Error(`No swap transaction: ${JSON.stringify(swapData)}`);
        }

        logger.info(`[DEB] Received swap transaction. Signing...`);
        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        transaction.sign([depositKeypair]);

        logger.info(`[DEB] Sending transaction...`);
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
        const mintPubkey = new PublicKey(mintAddress);

        // Retry logic for robustness
        let info = null;
        for (let i = 0; i < 3; i++) {
            info = await connection.getAccountInfo(mintPubkey);
            if (info) break;
            if (i < 2) await new Promise(r => setTimeout(r, 500));
        }

        if (info && info.owner) {
            return info.owner;
        }

        logger.warn(`Could not detect program for ${mintAddress}, defaulting to Standard Token Program.`);
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