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

        const feeWallet = await db.getAdminSetting('fee_wallet');
        if (!feeWallet) {
            throw new Error('Fee wallet not configured in admin settings');
        }

        const feeSOL = 0.001;

        const feeTransferIx = SystemProgram.transfer({
            fromPubkey: depositKeypair.publicKey,
            toPubkey: new PublicKey(feeWallet),
            lamports: solToLamports(feeSOL)
        });

        const feeTransaction = new Transaction().add(feeTransferIx);
        const feeSignature = await connection.sendTransaction(
            feeTransaction,
            [depositKeypair],
            { skipPreflight: false }
        );

        await connection.confirmTransaction(feeSignature, 'confirmed');
        logger.info(`Fee collected: ${feeSOL} SOL (tx: ${feeSignature})`);

        const solPrice = await price.getSolPrice();
        const buyAmountSOL = campaign.per_buy_usd / solPrice;

        logger.info(`Buying $${campaign.per_buy_usd} worth (${buyAmountSOL} SOL) of ${campaign.token_address}`);

        const swapResult = await buyTokens(
            campaign.token_address,
            buyAmountSOL,
            300
        );

        const transferSignature = await transferTokens(
            campaign.token_address,
            swapResult.outputAmount,
            campaign.destination_wallet
        );

        await db.createBuy({
            campaignId: campaign.id,
            swapSignature: swapResult.signature,
            transferSignature: transferSignature,
            amountUsd: campaign.per_buy_usd,
            amountSol: buyAmountSOL,
            tokensReceived: swapResult.outputAmount,
            feePaidSol: feeSOL,
            status: 'success'
        });

        const newBuysCompleted = campaign.buys_completed + 1;
        const isComplete = newBuysCompleted >= campaign.number_of_buys;

        await db.updateCampaignProgress(
            campaign.id,
            newBuysCompleted,
            isComplete ? 'completed' : 'active'
        );

        logger.info(`✅ Buy #${newBuysCompleted} completed for campaign ${campaign.id}`);

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

module.exports = {
    executeBuy
};