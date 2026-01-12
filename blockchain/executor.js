const { buyTokens, transferTokens } = require('./jupiter');
const price = require('../utils/price');
const { getConnection, solToLamports, lamportsToSol } = require('./wallet');
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { getDepositKeypair } = require('./wallet');
const db = require('../database/queries');
const logger = require('../utils/logger');
const { FEE_PER_BUY_USD } = require('../config/constants');
const notifications = require('../notifications/telegram');

async function executeBuy(campaign) {
    try {
        logger.info(`Executing buy for campaign ${campaign.id}`);

        const connection = getConnection();
        const depositKeypair = getDepositKeypair();

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
                logger.info(`📦 Found ${account.amount.toString()} stuck tokens (${programId.toString()}). Attempting transfer...`);
                const transferSignature = await transferTokens(
                    campaign.token_address,
                    account.amount.toString(),
                    campaign.destination_wallet
                );

                await updateDatabaseAfterSuccess(campaign, 'RECOVERED_SIG', transferSignature, campaign.per_buy_usd, 0, account.amount, 0);
                return { success: true, recovered: true };
            }
        } catch (e) {
            // Account likely doesn't exist, which is fine, proceed to normal buy.
            logger.debug('No stuck tokens found or account missing.');
        }

        // --- PRE-INITIALIZE ATA ---
        // Creating the ATA BEFORE the swap is the most reliable way to avoid 0x177e errors
        try {
            const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
            const { getTokenProgramId } = require('./jupiter');
            const programId = await getTokenProgramId(campaign.token_address);

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
            buyAmountSOL
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

        // 3. Move Tokens to user
        const transferSignature = await transferTokens(
            campaign.token_address,
            swapResult.outputAmount.toString(),
            campaign.destination_wallet
        );

        await updateDatabaseAfterSuccess(
            campaign,
            swapResult.signature,
            transferSignature,
            campaign.per_buy_usd,
            buyAmountSOL,
            swapResult.outputAmount,
            feeSignature ? feeSOL : 0
        );

        const newBuysCompleted = campaign.buys_completed + 1;
        const isComplete = newBuysCompleted >= campaign.number_of_buys;

        const result = {
            success: true,
            buyNumber: newBuysCompleted,
            totalBuys: campaign.number_of_buys,
            tokensReceived: swapResult.outputAmount,
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
            error: error.message
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
    executeBuy
};