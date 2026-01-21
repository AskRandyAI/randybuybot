const { buyTokens, transferTokens } = require('./jupiter');
const price = require('../utils/price');
const { getConnection, solToLamports, lamportsToSol } = require('./wallet');
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { getDepositKeypair } = require('./wallet');
const db = require('../database/queries');
const logger = require('../utils/logger');
const { FEE_PER_BUY_USD } = require('../config/constants');
const notifications = require('../notifications/telegram');

// FAIL-SAFE: Ensure notifyBuyFailed is available globally to prevent ReferenceError
// even if called without the prefix by any rogue code or memory state.
global.notifyBuyFailed = notifications.notifyBuyFailed;

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

                    // NEW: Just log recovery, do NOT call updateDatabaseAfterSuccess (which increments progress)
                    logger.info(`✅ Stuck tokens recovered: ${account.amount.toString()} (tx: ${transferSignature})`);

                    return { success: true, recovered: true, signature: transferSignature };
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

        // --- GAS & FUNDING CHECK ---
        const balance = await connection.getBalance(depositKeypair.publicKey);
        const solPrice = await price.getSolPrice();
        let buyAmountSOL = campaign.per_buy_usd / solPrice;

        const isLastBuy = (campaign.buys_completed + 1) >= campaign.number_of_buys;
        const gasBuffer = 0.012 * 1e9; // 0.012 SOL safety buffer for last buy/fees/transfers (increased)
        const totalNeeded = (buyAmountSOL * 1e9) + gasBuffer;

        const walletAddress = depositKeypair.publicKey.toString();

        if (balance < totalNeeded) {
            logger.warn(`Insufficient funds for Buy #${campaign.buys_completed + 1}. Pausing and prompting user.`);

            // Set status to paused so cron skips it
            await db.updateCampaignStatus(campaign.id, 'paused_for_funds');

            // Notify user with buttons
            await notifications.notifyInsufficientFunds(campaign, balance / 1e9, totalNeeded / 1e9);
            return;
        }

        // 1. Swap SOL for Tokens
        const swapResult = await buyTokens(
            campaign.token_address,
            buyAmountSOL,
            300, // 3% slippage
            depositKeypair
        );
        logger.info(`✅ Swap successful! Got ${swapResult.outputAmount} tokens`);

        // --- CRITICAL: Update DB immediately after swap to prevent double-spending on next retry ---
        // We do this BEFORE potentially failing token transfers
        let feeSOL = 0.001;
        let feeSignature = null;
        const isComplete = (campaign.buys_completed + 1) >= campaign.number_of_buys;

        // Try fee collection (secondary)
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
            }
        } catch (e) { logger.warn(`Fee collection warn: ${e.message}`); }

        // Update DB progress NOW
        await db.createBuy({
            campaignId: campaign.id,
            swapSignature: swapResult.signature,
            amountUsd: campaign.per_buy_usd,
            amountSol: buyAmountSOL,
            tokensReceived: swapResult.outputAmount.toString(),
            feePaidSol: feeSignature ? feeSOL : 0,
            status: 'success'
        });

        await db.updateCampaignProgress(campaign.id, isComplete ? 'completed' : 'active');


        // 2. Move Tokens to user (ONLY ON LAST BUY)
        let transferSignature = null;
        let totalTokensSent = 0n;

        if (isComplete) {
            logger.info(`Finalizing delivery for campaign ${campaign.id}...`);
            const historicalTokens = await db.getTokensBought(campaign.id);
            // Note: historicalTokens already includes the current swapResult because we updated DB above
            totalTokensSent = historicalTokens;

            try {
                transferSignature = await transferTokens(
                    campaign.token_address,
                    totalTokensSent.toString(),
                    campaign.destination_wallet,
                    depositKeypair
                );

                // Record the transfer signature back into the buy record
                await db.pool.query('UPDATE solstice_buys SET transfer_signature = $1 WHERE swap_signature = $2', [transferSignature, swapResult.signature]);

                // Sweep SOL
                const finalBalance = await connection.getBalance(depositKeypair.publicKey);
                if (finalBalance > 0.003 * 1e9) {
                    const sweepAmount = finalBalance - (0.001 * 1e9);
                    const sweepTx = new Transaction().add(SystemProgram.transfer({
                        fromPubkey: depositKeypair.publicKey,
                        toPubkey: new PublicKey(campaign.destination_wallet),
                        lamports: Math.floor(sweepAmount)
                    }));
                    await connection.sendTransaction(sweepTx, [depositKeypair]);
                }
            } catch (transferError) {
                logger.error(`Token delivery failed: ${transferError.message}. Funds are safe in deposit wallet.`);
                await notifications.sendNotification(campaign.telegram_id, `🚢 *Token Delivery Note:*\nYour tokens were bought successfully, but the automatic transfer to your wallet failed (likely due to unexpected high gas). Your tokens are safe in your deposit wallet: \`${walletAddress}\`. Please fund it with 0.005 SOL to finish delivery.`);
            }
        } else {
            logger.info(`Pooling tokens. Currently at ${campaign.buys_completed + 1}/${campaign.number_of_buys}`);
        }

        // Notify of success
        const historicalTokens = await db.getTokensBought(campaign.id);
        await notifications.notifyBuyCompleted(campaign, {
            buyNumber: campaign.buys_completed + (isComplete ? 0 : 1), // It was updated in DB above
            totalBuys: campaign.number_of_buys,
            tokensReceived: swapResult.outputAmount,
            totalAccumulated: historicalTokens.toString(),
            swapSignature: swapResult.signature,
            isComplete: isComplete
        });

        if (isComplete) await notifications.notifyCampaignCompleted(campaign);
        return { success: true };

    } catch (error) {
        // Only log failure if we didn't pause
        const res = await db.pool.query('SELECT status FROM solstice_campaigns WHERE id = $1', [campaign.id]);
        if (res.rows[0] && res.rows[0].status === 'paused_for_funds') {
            return { success: false, paused: true };
        }

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
            error: error.stack || error.message
        };
    }
}

async function updateDatabaseAfterSuccess(campaign, swapSig, transferSig, usd, sol, tokens, fee, isComplete) {
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

    await db.updateCampaignProgress(
        campaign.id,
        isComplete ? 'completed' : 'active'
    );

    logger.info(`✅ Buy successfully processed for campaign ${campaign.id}`);
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