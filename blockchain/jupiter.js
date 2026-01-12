const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

// Trying a different endpoint that might have better DNS resolution
const JUPITER_API = 'https://public.jupiterapi.com';
// Backup: 'https://quote-api.jup.ag/v6'

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

async function transferTokens(tokenMint, amount, destinationWallet) {
    try {
        // Modern SPL Token imports
        const {
            getAssociatedTokenAddress,
            createTransferInstruction,
            createAssociatedTokenAccountInstruction,
            getAccount,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        } = require('@solana/spl-token');

        const connection = getConnection();
        const depositKeypair = getDepositKeypair();

        const mintPublicKey = new PublicKey(tokenMint);
        const destinationPublicKey = new PublicKey(destinationWallet);

        // 1. Get Source Account (Bot's Wallet)
        const fromTokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            depositKeypair.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // 2. Get Destination Account (User's Wallet)
        const toTokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            destinationPublicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const transaction = new (require('@solana/web3.js').Transaction)();

        // 3. Check if Destination Account exists
        try {
            await getAccount(connection, toTokenAccount);
        } catch (error) {
            // If account not found, create it
            logger.info('Destination ATA missing. Creating it...');
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    depositKeypair.publicKey, // Payer
                    toTokenAccount, // ATA
                    destinationPublicKey, // Owner
                    mintPublicKey // Mint
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
            TOKEN_PROGRAM_ID
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
        // Don't throw fatal error to stop campaign, just log it. 
        // We technically bought the tokens, they just didn't move.
        // Return null or throw? Throwing causes the bot to mark "Buy Failed".
        // Let's throw so it retries? 
        // No, if we retry, we buy AGAIN.
        // We really should separate Buy from Transfer.
        // For now, throw so user knows.
        throw error;
    }
}

module.exports = {
    buyTokens,
    transferTokens,
    getQuote
};