const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

// Trying a different endpoint that might have better DNS resolution
const JUPITER_API = 'https://public.jupiterapi.com';
// Backup: 'https://quote-api.jup.ag/v6'

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function getQuote(inputMint, outputMint, amountLamports, slippageBps = 300) {
    try {
        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amountLamports.toString(),
            slippageBps: slippageBps.toString(),
            onlyDirectRoutes: 'false',
            asLegacyTransaction: 'false'
        });

        const response = await fetch(`${JUPITER_API}/quote?${params}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Jupiter quote failed (${response.status}): ${errorText}`);
        }

        const responseText = await response.text();
        let quote;
        try {
            quote = JSON.parse(responseText);
        } catch (e) {
            throw new Error(`Invalid JSON from Jupiter: ${responseText.substring(0, 100)}`);
        }

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
        const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const connection = getConnection();
        const depositKeypair = getDepositKeypair();

        const mintPublicKey = new PublicKey(tokenMint);
        const destinationPublicKey = new PublicKey(destinationWallet);

        const fromTokenAccount = await Token.getAssociatedTokenAddress(
            TOKEN_PROGRAM_ID,
            mintPublicKey,
            depositKeypair.publicKey
        );

        const toTokenAccount = await Token.getAssociatedTokenAddress(
            TOKEN_PROGRAM_ID,
            mintPublicKey,
            destinationPublicKey
        );

        const transferIx = Token.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            fromTokenAccount,
            toTokenAccount,
            depositKeypair.publicKey,
            [],
            amount
        );

        const { Transaction } = require('@solana/web3.js');
        const transaction = new Transaction().add(transferIx);

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
    getQuote
};