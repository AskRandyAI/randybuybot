const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { getConnection, getDepositKeypair, lamportsToSol, solToLamports } = require('./wallet');
const logger = require('../utils/logger');

const JUPITER_API_PUBLIC = 'https://public.jupiterapi.com';
const JUPITER_API_V6 = 'https://quote-api.jup.ag/v6';
const JUPITER_API_ULTRA = 'https://api.jup.ag/ultra/v1';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function getQuote(inputMint, outputMint, amountLamports) {
    try {
        const { getDepositKeypair } = require('./wallet');
        const wallet = getDepositKeypair().publicKey;

        const programId = await getTokenProgramId(outputMint);
        const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const destinationTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(outputMint),
            wallet,
            false,
            programId,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amountLamports.toString(),
            taker: wallet.toString(),
            slippageBps: '1000',
            useSharedAccounts: 'false',
            onlyDirectRoutes: 'false',
            destinationTokenAccount: destinationTokenAccount.toString()
        });

        const JUP_KEY = process.env.JUPITER_API_KEY;
        const JUP_BASE = JUP_KEY ? JUPITER_API_ULTRA : JUPITER_API_PUBLIC;
        const url = `${JUP_BASE}/order?${params}`;
        let response = await fetch(url, {
            headers: {
                'User-Agent': 'RandyBuyBot/1.0',
                'x-api-key': JUP_KEY || ''
            }
        });

        if (!response.ok && JUP_KEY) {
            logger.warn(`Ultra API failed (${response.status}). Trying V6 backup...`);
            const v6Params = new URLSearchParams({
                inputMint,
                outputMint,
                amount: amountLamports.toString(),
                autoSlippage: 'true',
                maxAutoSlippageBps: '2000'
            });
            response = await fetch(`${JUPITER_API_V6}/quote?${v6Params}`, {
                headers: { 'User-Agent': 'RandyBuyBot/1.0' }
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Jupiter quote failed: ${errorText}`);
        }

        const quote = await response.json();
        if (quote.error) {
            throw new Error(`Jupiter quote error: ${quote.error}`);
        }

        return quote;

    } catch (error) {
        logger.error('Error getting Jupiter quote:', error);
        throw error;
    }
}

async function executeSwap(quote) {
    try {
        const connection = getConnection();
        const depositKeypair = getDepositKeypair();

        const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const programId = await getTokenProgramId(quote.outputMint);

        const destinationTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(quote.outputMint),
            depositKeypair.publicKey,
            false,
            programId,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
        const JUP_API = JUPITER_API_KEY ? JUPITER_API_ULTRA : JUPITER_API_PUBLIC;

        if (JUPITER_API_KEY && quote.transaction) {
            logger.info(`[DEB] Using Ultra Execute...`);
            const transactionBuf = Buffer.from(quote.transaction, 'base64');
            const transaction = VersionedTransaction.deserialize(transactionBuf);
            transaction.sign([depositKeypair]);

            const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
            const executeResponse = await fetch(`${JUP_API}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'RandyBuyBot/1.0',
                    'x-api-key': JUPITER_API_KEY
                },
                body: JSON.stringify({
                    signedTransaction,
                    requestId: quote.requestId
                })
            });

            if (!executeResponse.ok) {
                const errorText = await executeResponse.text();
                throw new Error(`Jupiter Ultra execute failed: ${errorText}`);
            }

            const executeData = await executeResponse.json();
            return {
                signature: executeData.signature,
                inputAmount: lamportsToSol(quote.inAmount),
                outputAmount: Number(quote.outAmount),
                outputMint: quote.outputMint
            };
        }

        const swapBody = {
            quoteResponse: quote,
            userPublicKey: depositKeypair.publicKey.toString(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            useSharedAccounts: false,
            prioritizationFeeLamports: 'auto',
            destinationTokenAccount: destinationTokenAccount.toString()
        };

        const swapResponse = await fetch(`${JUPITER_API_V6}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'RandyBuyBot/1.0'
            },
            body: JSON.stringify(swapBody)
        });

        if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            throw new Error(`Jupiter swap error: ${errorText}`);
        }

        const swapData = await swapResponse.json();
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
        transaction.sign([depositKeypair]);

        const signature = await connection.sendTransaction(transaction);
        await connection.confirmTransaction(signature, 'confirmed');

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