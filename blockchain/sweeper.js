const { Connection, Transaction, SystemProgram, Keypair, PublicKey } = require('@solana/web3.js');
const db = require('../database/queries');
const logger = require('../utils/logger');
const { getDepositKeypair, getConnection } = require('./wallet');
const bs58 = require('bs58');

async function sweepDust() {
    logger.info('🧹 Starting Dust Sweep...');

    // 1. Get Fee Wallet
    const feeWalletAddress = process.env.FEE_WALLET_ADDRESS;
    if (!feeWalletAddress) {
        logger.error('Cannot sweep dust: FEE_WALLET_ADDRESS missing.');
        return;
    }

    // 2. Get Candidates
    const candidates = await db.getUnsweptCompletedCampaigns(50); // Batch size 50
    if (candidates.length === 0) {
        logger.info('No campaigns to sweep.');
        return;
    }

    logger.info(`Found ${candidates.length} completed campaigns to check.`);

    const connection = getConnection();
    let sweptCount = 0;
    let totalSwept = 0;

    for (const campaign of candidates) {
        try {
            // Load keypair
            let keypair;
            if (campaign.deposit_private_key) {
                try {
                    keypair = Keypair.fromSecretKey(bs58.decode(campaign.deposit_private_key));
                } catch (e) {
                    logger.warn(`Invalid key for campaign ${campaign.id}, skipping.`);
                    continue;
                }
            } else {
                // Skip global wallet fallback! We don't want to sweep the main wallet by accident.
                logger.warn(`Campaign ${campaign.id} uses global wallet? Skipping safety check.`);
                continue;
            }

            // Check Balance
            const balance = await connection.getBalance(keypair.publicKey);
            const gasFee = 5000; // 0.000005 SOL
            const rentExemption = 0; // We can drain it if we want to close account, but for now just sweep excess.

            if (balance <= gasFee) {
                logger.info(`Campaign ${campaign.id} empty (${balance} lamports). Marking swept.`);
                await db.markCampaignSwept(campaign.id);
                continue;
            }

            // Calculate sweep amount
            const sweepAmount = balance - gasFee;
            const sweepAmountSOL = sweepAmount / 1e9;

            if (sweepAmountSOL < 0.001) {
                // If amount is tiny (< $0.15), maybe just skip to save network spam? 
                // Alternatively, just sweep it. Let's sweep it.
            }

            logger.info(`Sweeping ${sweepAmountSOL.toFixed(5)} SOL from Campaign ${campaign.id}...`);

            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: new PublicKey(feeWalletAddress),
                    lamports: sweepAmount
                })
            );

            const signature = await connection.sendTransaction(tx, [keypair]);
            await connection.confirmTransaction(signature, 'confirmed');

            logger.info(`✅ Swept! Tx: ${signature}`);

            await db.markCampaignSwept(campaign.id);
            sweptCount++;
            totalSwept += sweepAmountSOL;

            // Small delay to prevent rate limits
            await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
            logger.error(`Failed to sweep campaign ${campaign.id}:`, error);
        }
    }

    logger.info(`🧹 Dust Sweep Complete. Swept ${sweptCount} wallets for ${totalSwept.toFixed(4)} SOL.`);
}

module.exports = { sweepDust };
