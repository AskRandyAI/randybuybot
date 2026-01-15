const { getConnection, getDepositPublicKey, lamportsToSol } = require('./wallet');
const { PublicKey } = require('@solana/web3.js');

const db = require('../database/queries');
const logger = require('../utils/logger');
const { DEPOSIT_CHECK_INTERVAL_MS } = require('../config/constants');
const notifications = require('../notifications/telegram');

let monitorInterval = null;
let lastCheckedSignature = null;

function startDepositMonitor() {
    if (monitorInterval) {
        logger.warn('Deposit monitor already running');
        return;
    }

    logger.info('🔍 Starting deposit monitor...');

    checkForDeposits();

    monitorInterval = setInterval(checkForDeposits, DEPOSIT_CHECK_INTERVAL_MS);

    logger.info('✅ Deposit monitor started');
}

function stopDepositMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        logger.info('🛑 Deposit monitor stopped');
    }
}

async function checkForDeposits() {
    try {
        const connection = getConnection();
        const depositWallet = getDepositPublicKey();

        const signatures = await connection.getSignaturesForAddress(
            depositWallet,
            { limit: 5 }
        );

        if (signatures.length === 0) {
            return;
        }

        const newestSignature = signatures[0].signature;

        if (!lastCheckedSignature) {
            lastCheckedSignature = newestSignature;
            logger.info('Initialized deposit monitor with latest signature');
            return;
        }

        if (newestSignature === lastCheckedSignature) {
            return;
        }

        for (let i = signatures.length - 1; i >= 0; i--) {
            const sig = signatures[i];

            if (sig.signature === lastCheckedSignature) {
                break;
            }

            await processTransaction(connection, sig.signature);
        }

        lastCheckedSignature = newestSignature;

        // NEW: Always check check total balance for pending campaigns (Auto-Sweep)
        // This ensures pre-funded wallets activate automatically
        await checkWalletBalanceForPendingCampaigns();

    } catch (error) {
        logger.error('Error checking for deposits:', error);
    }
}

async function checkWalletBalanceForPendingCampaigns() {
    try {
        const pendingCampaigns = await db.getAwaitingDepositCampaigns();
        if (pendingCampaigns.length === 0) return;

        const connection = getConnection();

        for (const campaign of pendingCampaigns) {
            let pubKey;
            if (campaign.deposit_address) {
                pubKey = new PublicKey(campaign.deposit_address);
            } else {
                pubKey = getDepositPublicKey();
                logger.info(`Campaign ${campaign.id} has no unique address, checking global wallet.`);
            }

            const balanceLamports = await connection.getBalance(pubKey);
            const balanceSOL = lamportsToSol(balanceLamports);

            const expected = parseFloat(campaign.expected_deposit_sol);
            // Allow 50% threshold for testing/flexibility (same as /status command)
            if (balanceSOL >= expected * 0.5) {
                logger.info(`💰 Auto-Sweep: Wallet balance (${balanceSOL}) covers expected (${expected}) for campaign ${campaign.id}. Activating!`);
                await activateCampaign(campaign, balanceSOL, 'AUTO_SWEEP_MATCH');
            }
        }

    } catch (error) {
        logger.error('Error in auto-sweep:', error);
    }
}


async function processTransaction(connection, signature) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });

        if (!tx || !tx.meta || tx.meta.err) {
            return;
        }

        const depositWallet = getDepositPublicKey();

        let depositAmount = 0;

        for (let i = 0; i < tx.transaction.message.accountKeys.length; i++) {
            const account = tx.transaction.message.accountKeys[i];

            if (account.pubkey.toString() === depositWallet.toString()) {
                const preBalance = tx.meta.preBalances[i];
                const postBalance = tx.meta.postBalances[i];
                depositAmount = postBalance - preBalance;
                break;
            }
        }

        if (depositAmount <= 0) {
            return;
        }

        const depositSOL = lamportsToSol(depositAmount);

        logger.info(`💰 Deposit detected: ${depositSOL} SOL (tx: ${signature})`);

        await matchDepositToCampaign(depositSOL, signature);

    } catch (error) {
        logger.error(`Error processing transaction ${signature}:`, error);
    }
}

async function matchDepositToCampaign(depositSOL, signature) {
    try {
        const pendingCampaigns = await db.getAwaitingDepositCampaigns();

        if (pendingCampaigns.length === 0) {
            logger.warn(`Received ${depositSOL} SOL but no pending campaigns found`);
            return;
        }

        let matchedCampaign = null;

        for (const campaign of pendingCampaigns) {
            const expected = parseFloat(campaign.expected_deposit_sol);
            const difference = Math.abs(depositSOL - expected);
            // Strict tolerance: 0.000005 SOL to account for tiny floating point drifts,
            // but strict enough to be unique given our dust logic.
            const tolerance = 0.000005;

            if (difference <= tolerance) {
                matchedCampaign = campaign;
                break;
            } else {
                logger.debug(`Mismatch: Rx ${depositSOL} vs Exp ${expected} (Diff: ${difference.toFixed(9)})`);
            }
        }

        if (!matchedCampaign) {
            logger.warn(`Received ${depositSOL} SOL but no matching campaign found`);
            return;
        }

        await activateCampaign(matchedCampaign, depositSOL, signature);

    } catch (error) {
        logger.error('Error matching deposit to campaign:', error);
    }
}

async function activateCampaign(campaign, actualDepositSOL, signature) {
    try {
        await db.updateCampaignStatus(campaign.id, 'active');
        await db.updateCampaignDeposit(campaign.id, actualDepositSOL, signature);

        logger.info(`✅ Campaign ${campaign.id} activated with ${actualDepositSOL} SOL`);

        await notifications.notifyDepositDetected(campaign, actualDepositSOL, signature);

    } catch (error) {
        logger.error(`Error activating campaign ${campaign.id}:`, error);
    }
}

module.exports = {
    startDepositMonitor,
    stopDepositMonitor
};