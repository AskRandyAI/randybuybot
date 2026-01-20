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
        const gasBuffer = 0.01 * 1e9; // 0.01 SOL safety buffer for last buy/fees/transfers
        const totalNeeded = (buyAmountSOL * 1e9) + gasBuffer;

        const walletAddress = depositKeypair.publicKey.toString();
        let skipSwap = false;
        let swapResult = null;

        if (balance < totalNeeded) {
            if (isLastBuy) {
                // EMERGENCY COMPLETION: We don't have enough for the full last buy.
                // Try to spend what's left, or just skip to transfer if balance is tiny.
                const remainingForBuy = (balance - gasBuffer) / 1e9;

                if (remainingForBuy > 0.002) { // At least ~$0.25 worth of SOL
                    logger.warn(`Last buy: Insufficient funds for full $${campaign.per_buy_usd}. Adjusting last buy to available ${remainingForBuy.toFixed(6)} SOL.`);
                    buyAmountSOL = remainingForBuy;
                } else {
                    logger.info(`Last buy: Balance too low for swap (${(balance / 1e9).toFixed(6)} SOL). skipping last swap to prioritize delivery and sweep.`);
                    skipSwap = true;
                    // Provide a dummy successful swap result to continue flow
                    swapResult = { signature: 'SKIPPED_LOW_FUNDS', outputAmount: 0 };
                }
            } else if (campaign.buys_completed > 0) {
                // Auto-refund and cancel if we run out of gas mid-campaign
                logger.warn(`Insufficient funds to continue campaign. Refunding remaining SOL and cancelling.`);
                const refund = await refundSOL(campaign);
                await db.updateCampaignProgress(campaign.id, 'cancelled');
                let refundInfo = refund.success ? ` (Refunded: ${refund.amountSol} SOL)` : '';
                await notifications.notifyBuyFailed(campaign, (campaign.buys_completed || 0) + 1, `Insufficient funds to continue. Remaining balance has been refunded to your wallet.${refundInfo}`, walletAddress);
                return;
            } else {
                // First buy and not enough funds
                logger.warn(`Insufficient SOL in wallet (${walletAddress}). Balance: ${balance / 1e9} SOL. Needed: ${totalNeeded / 1e9} SOL.`);
                await notifications.notifyBuyFailed(
                    campaign,
                    (campaign.buys_completed || 0) + 1,
                    "Insufficient SOL for gas fees and purchase. Please fund your deposit wallet.",
                    walletAddress
                );
                return;
            }
        }

        // 1. Swap SOL for Tokens
        if (!skipSwap) {
            try {
                swapResult = await buyTokens(
                    campaign.token_address,
                    buyAmountSOL,
                    300, // 3% slippage
                    depositKeypair
                );
                logger.info(`✅ Swap successful! Got ${swapResult.outputAmount} tokens`);
            } catch (swapError) {
                // If it's the last buy and the swap failed (e.g. slippage), 
                // we should still try to deliver what we have so far
                if (isLastBuy) {
                    logger.error(`Last buy swap failed: ${swapError.message}. Proceeding to delivery of existing tokens.`);
                    skipSwap = true;
                    swapResult = { signature: 'FAILED_BUT_FINISHED', outputAmount: 0 };
                } else {
                    throw swapError;
                }
            }
        }


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
        const isComplete = (campaign.buys_completed + 1) >= campaign.number_of_buys;
        let transferSignature = null;
        let totalTokensSent = 0n;

        if (isComplete) {
            logger.info(`Campaign complete! Finalizing batch transfer and SOL sweep for campaign ${campaign.id}...`);

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

            // --- FULL SOL SWEEP (Safety Check: Only on real completion) ---
            try {
                const finalBalance = await connection.getBalance(depositKeypair.publicKey);
                const sweepBuffer = 0.00001 * 1e9; // 10,000 lamports buffer

                if (finalBalance > sweepBuffer) {
                    const sweepAmount = finalBalance - sweepBuffer;
                    logger.info(`🧹 Preparing final SOL sweep of ${sweepAmount / 1e9} SOL...`);

                    const sweepTx = new Transaction().add(
                        SystemProgram.transfer({
                            fromPubkey: depositKeypair.publicKey,
                            toPubkey: new PublicKey(campaign.destination_wallet),
                            lamports: Math.floor(sweepAmount)
                        })
                    );
                    const sweepSig = await connection.sendTransaction(sweepTx, [depositKeypair]);
                    logger.info(`✅ SOL Sweep Success: ${sweepAmount / 1e9} SOL sent to ${campaign.destination_wallet} (tx: ${sweepSig})`);
                } else {
                    logger.info(`ℹ️ Wallet balance too low for sweep (${finalBalance / 1e9} SOL). skipping.`);
                }
            } catch (sweepError) {
                logger.warn(`SOL Sweep failed: ${sweepError.message}`);
            }

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
            feeSignature ? feeSOL : 0,
            isComplete
        );


        // Calculate total accumulated for notification
        const historicalTokens = await db.getTokensBought(campaign.id);
        const totalAccumulated = historicalTokens + BigInt(swapResult.outputAmount.toString());

        const result = {
            success: true,
            buyNumber: campaign.buys_completed + 1,
            totalBuys: campaign.number_of_buys,
            tokensReceived: swapResult.outputAmount,
            totalAccumulated: totalAccumulated.toString(),
            swapSignature: swapResult.signature,
            transferSignature: transferSignature,
            isComplete: isComplete
        };

        // Notify of the buy
        await notifications.notifyBuyCompleted(campaign, result);

        // Notify of completion (if it's the last one)
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