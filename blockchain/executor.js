const { buyTokens, transferTokens } = require('./jupiter');
const price = require('../utils/price');
const { getConnection, solToLamports, lamportsToSol } = require('./wallet');
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { getDepositKeypair } = require('./wallet');
const db = require('../database/queries');
const logger = require('../utils/logger');
const { FEE_PER_BUY_USD } = require('../config/constants');
const notifications = require('../notifications/telegram');

// [DIAGNOSTIC] Check imports
if (typeof buyTokens !== 'function') {
    console.error('[CRITICAL] buyTokens is NOT a function in executor.js!');
    try {
        const jup = require('./jupiter');
        console.error('[CRITICAL] jupiter exports:', Object.keys(jup));
    } catch (e) { console.error('Error re-requiring jupiter:', e); }
} else {
    console.log('[DIAG] buyTokens imported successfully in executor.js');
}

async function executeBuy(campaign) {
    try {
        logger.info(`Executing buy for campaign ${campaign.id}`);

        const connection = getConnection();

        // --- NEW: Use campaign-specific Keypair (with fallback) ---
        const { Keypair } = require('@solana/web3.js');
        const bs58 = require('bs58');
        let depositKeypair;

        logger.info(`[DEB] Checking keys for Campaign ${campaign.id}. Unique key available: ${!!campaign.deposit_private_key}`);

        if (campaign.deposit_private_key && campaign.deposit_private_key.trim() !== '') {
            try {
                depositKeypair = Keypair.fromSecretKey(bs58.decode(campaign.deposit_private_key));
                logger.info(`[DEB] Using UNIQUE wallet: ${depositKeypair.publicKey.toString()}`);
            } catch (error) {
                logger.error(`[DEB] Failed to decode unique key for campaign ${campaign.id}: ${error.message}`);
                depositKeypair = getDepositKeypair();
                logger.info(`[DEB] Falling back to GLOBAL wallet after decode error.`);
            }
        } else {
            depositKeypair = getDepositKeypair();
            logger.info(`[DEB] Using GLOBAL wallet for campaign ${campaign.id} (No unique key found)`);
        }




        // --- NEW: STUCK TOKEN RECOVERY ---
        // Check if we already have the tokens (from a previous failed transfer)
        try {
            const { getAssociatedTokenAddress, getAccount, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
            const { getTokenProgramId } = require('./jupiter');

            const programId = await getTokenProgramId(campaign.token_address);
            const ata = await getAssociatedTokenAddress(
                new PublicKey(campaign.token_address),
                depositKeypair.publicKey,
                false,
                programId,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const account = await getAccount(connection, ata, 'confirmed', programId);

            if (account && account.amount > 0n) {
                // Check if we have SOL for gas to transfer
                const balance = await connection.getBalance(depositKeypair.publicKey);
                if (balance < 0.001 * 1e9) {
                    logger.warn(`[DIAG-RECOVERY] Stuck tokens found (${account.amount.toString()}) but insufficient SOL for gas to recover them yet.`);
                } else {
                    logger.info(`📦 Found ${account.amount.toString()} stuck tokens. Attempting transfer...`);
                    const transferSignature = await transferTokens(
                        campaign.token_address,
                        account.amount.toString(),
                        campaign.destination_wallet,
                        depositKeypair
                    );
                    await updateDatabaseAfterSuccess(campaign, 'RECOVERED_SIG', transferSignature, campaign.per_buy_usd, 0, account.amount, 0);
                    return { success: true, recovered: true };
                }
            }
        } catch (e) {
            // Account likely doesn't exist or insufficient gas for transfer
            logger.warn(`[DIAG-RECOVERY] Stuck token recovery skipped/failed: ${e.message}`);
        }

        // --- PRE-INITIALIZE ATA ---
        // Creating the ATA BEFORE the swap is the most reliable way to avoid 0x177e errors
        try {
            const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
            const { getTokenProgramId } = require('./jupiter');
            const programId = await getTokenProgramId(campaign.token_address);
            logger.info(`[DEB] Token ${campaign.token_address} is using Program: ${programId.toString()}`);
            const ata = await getAssociatedTokenAddress(
                new PublicKey(campaign.token_address),
                depositKeypair.publicKey,
                false,
                programId,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            try {
                await getAccount(connection, ata, 'confirmed', programId);
            } catch (e) {
                logger.info(`Creating required ATA for ${campaign.token_address} before swap...`);
                const ataTx = new Transaction().add(
                    createAssociatedTokenAccountInstruction(
                        depositKeypair.publicKey,
                        ata,
                        depositKeypair.publicKey,
                        new PublicKey(campaign.token_address),
                        programId
                    )
                );
                const sig = await connection.sendTransaction(ataTx, [depositKeypair]);
                await connection.confirmTransaction(sig, 'confirmed');
                logger.info(`✅ ATA Created: ${sig}. Waiting 2s for RPC consistency...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (ataError) {
            logger.warn(`Could not pre-create ATA: ${ataError.message}. Proceeding anyway...`);
        }

        // --- GAS CHECK ---
        const balance = await connection.getBalance(depositKeypair.publicKey);
        const minGas = 0.005 * 1e9; // 0.005 SOL minimum for safety
        if (balance < minGas) {
            logger.warn(`Insufficient SOL for gas in deposit wallet (${depositKeypair.publicKey.toString()}). Balance: ${balance / 1e9} SOL. Skipping buy.`);
            await notifyBuyFailed(campaign, (campaign.buys_completed || 0) + 1, "Insufficient SOL for gas fees (Minimum 0.005 SOL recommended). Please fund your deposit wallet.");
            return;
        }

        const solPrice = await price.getSolPrice();
        const buyAmountSOL = campaign.per_buy_usd / solPrice;

        logger.info(`Buying $${campaign.per_buy_usd} worth (${buyAmountSOL.toFixed(6)} SOL) of ${campaign.token_address}`);

        // 1. Swap SOL for Tokens (This is where slippage happens)
        const swapResult = await buyTokens(
            campaign.token_address,
            buyAmountSOL,
            300, // 3% slippage
            depositKeypair
        );


        // 2. ONLY IF SWAP SUCCEEDS - Collect Fee
        let feeSignature = null;
        let feeSOL = 0.001; // Approx $0.05-0.10 depending on price

        try {
            const feeWallet = await db.getAdminSetting('fee_wallet');
            if (feeWallet) {
                const feeTransferIx = SystemProgram.transfer({
                    fromPubkey: depositKeypair.publicKey,
                    toPubkey: new PublicKey(feeWallet),
                    lamports: solToLamports(feeSOL)
                });

                const feeTransaction = new Transaction().add(feeTransferIx);
                feeSignature = await connection.sendTransaction(feeTransaction, [depositKeypair]);
                await connection.confirmTransaction(feeSignature, 'confirmed');
                logger.info(`✅ Fee collected: ${feeSOL} SOL (tx: ${feeSignature})`);
            }
        } catch (feeError) {
            // Log but don't fail the whole buy if fee collection fails (secondary)
            logger.warn(`Warn: Fee collection failed after success: ${feeError.message}`);
        }

        // 3. Move Tokens to user (ONLY ON LAST BUY)
        const newBuysCompleted = campaign.buys_completed + 1;
        const isComplete = newBuysCompleted >= campaign.number_of_buys;
        let transferSignature = null;
        let totalTokensSent = 0n;

        if (isComplete) {
            logger.info(`Campaign complete! Finalizing batch transfer for campaign ${campaign.id}...`);

            // Get all successful tokens from history + current buy
            const historicalTokens = await db.getTokensBought(campaign.id);
            totalTokensSent = historicalTokens + BigInt(swapResult.outputAmount.toString());

            logger.info(`📦 Batch transferring total: ${totalTokensSent.toString()} tokens to ${campaign.destination_wallet}`);

            transferSignature = await transferTokens(
                campaign.token_address,
                totalTokensSent.toString(),
                campaign.destination_wallet,
                depositKeypair
            );

        } else {
            logger.info(`Pooling tokens in bot wallet. Transfer will happen after final buy (#${campaign.number_of_buys}).`);
        }

        await updateDatabaseAfterSuccess(
            campaign,
            swapResult.signature,
            transferSignature,
            campaign.per_buy_usd,
            buyAmountSOL,
            swapResult.outputAmount,
            feeSignature ? feeSOL : 0
        );


        // Calculate total accumulated for notification
        const historicalTokens = await db.getTokensBought(campaign.id);
        const totalAccumulated = historicalTokens + BigInt(swapResult.outputAmount.toString());

        const result = {
            success: true,
            buyNumber: newBuysCompleted,
            totalBuys: campaign.number_of_buys,
            tokensReceived: swapResult.outputAmount,
            totalAccumulated: totalAccumulated.toString(),
            swapSignature: swapResult.signature,
            transferSignature: transferSignature,
            isComplete: isComplete
        };


        await notifications.notifyBuyCompleted(campaign, result);


        if (isComplete) {
            await notifications.notifyCampaignCompleted(campaign);
        }

        return result;

    } catch (error) {
        logger.error(`Error executing buy for campaign ${campaign.id}:`, error);

        await db.createBuy({
            campaignId: campaign.id,
            amountUsd: campaign.per_buy_usd,
            status: 'failed',
            errorMessage: error.message
        });

        await notifications.notifyBuyFailed(
            campaign,
            campaign.buys_completed + 1,
            error.message
        );

        return {
            success: false,
            error: error.logs ? `Logs: ${JSON.stringify(error.logs)}` : error.message
        };
    }
}

async function updateDatabaseAfterSuccess(campaign, swapSig, transferSig, usd, sol, tokens, fee) {
    await db.createBuy({
        campaignId: campaign.id,
        swapSignature: swapSig,
        transferSignature: transferSig,
        amountUsd: usd,
        amountSol: sol,
        tokensReceived: tokens.toString(),
        feePaidSol: fee,
        status: 'success'
    });

    const newBuysCompleted = campaign.buys_completed + 1;
    const isComplete = newBuysCompleted >= campaign.number_of_buys;

    await db.updateCampaignProgress(
        campaign.id,
        newBuysCompleted,
        isComplete ? 'completed' : 'active'
    );

    logger.info(`✅ Buy #${newBuysCompleted} successfully processed for campaign ${campaign.id}`);
}

module.exports = {
    executeBuy,
    refundSOL
};

async function refundSOL(campaign) {
    try {
        const connection = getConnection();
        const { Keypair, SystemProgram, Transaction, PublicKey } = require('@solana/web3.js');
        const bs58 = require('bs58');
        const { getDepositKeypair } = require('./wallet');

        logger.info(`Processing refund for campaign ${campaign.id}`);

        let depositKeypair;
        if (campaign.deposit_private_key) {
            try {
                depositKeypair = Keypair.fromSecretKey(bs58.decode(campaign.deposit_private_key));
            } catch (e) {
                logger.error(`Failed to decode key for refund ${campaign.id}, fallback to global.`);
                depositKeypair = getDepositKeypair();
            }
        } else {
            depositKeypair = getDepositKeypair();
        }

        const balance = await connection.getBalance(depositKeypair.publicKey);
        const gasBuffer = 0.000005 * 1e9; // 5000 lamports for fee

        if (balance <= gasBuffer) {
            logger.info(`Balance too low for refund: ${balance} lamports.`);
            return { success: false, reason: 'Zero Balance' };
        }

        const refundAmount = balance - gasBuffer;

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: depositKeypair.publicKey,
                toPubkey: new PublicKey(campaign.destination_wallet),
                lamports: Math.floor(refundAmount)
            })
        );

        const signature = await connection.sendTransaction(transaction, [depositKeypair]);
        await connection.confirmTransaction(signature, 'confirmed');

        logger.info(`✅ Refund success: ${signature}`);
        return { success: true, signature, amountSol: refundAmount / 1e9 };

    } catch (error) {
        logger.error(`Refund failed for campaign ${campaign.id}:`, error);
        return { success: false, error: error.message };
    }
}