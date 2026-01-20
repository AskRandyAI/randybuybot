const logger = require('../utils/logger');

let botInstance = null;

function initializeNotifications(bot) {
    botInstance = bot;
    logger.info('✅ Telegram notifications initialized');
}

const messages = require('../bot/messages');

/**
 * Parses technical Solana/Jupiter errors into user-friendly messages
 */
function cleanErrorMessage(error) {
    const errorStr = String(error);

    if (errorStr.includes('0x177e')) {
        return 'Token program mismatch (IncorrectTokenProgramID). We are adjusting the campaign settings to fix this!';
    }
    if (errorStr.includes('ENOTFOUND') || errorStr.includes('fetch failed')) {
        return 'Temporary network issue reaching Solana/Jupiter. No funds were spent.';
    }
    if (errorStr.includes('Simulation failed')) {
        return 'Transaction failed during simulation. This usually means the price moved too fast or liquidity is low.';
    }
    if (errorStr.includes('Slippage tolerance exceeded') || errorStr.includes('Slippage out of bounds')) {
        return 'Slippage was too high for this trade. Auto-slippage is trying to adjust!';
    }
    if (errorStr.includes('insufficient lamports') || errorStr.includes('insufficient funds')) {
        return 'Insufficient SOL for gas fees in the deposit wallet.';
    }
    if (errorStr.includes('TOKEN_NOT_TRADABLE')) {
        return 'This token is not yet tradable on Raydium/Jupiter. Waiting for more liquidity...';
    }

    // Default: Return a shortened version of the error message if it's too long
    if (errorStr.length > 100) {
        return errorStr.substring(0, 100) + '... (Technical error logged on server)';
    }

    return errorStr;
}

async function sendNotification(telegramId, message, options = {}) {
    if (!botInstance) {
        logger.error('Bot instance not initialized for notifications');
        return;
    }

    try {
        await botInstance.sendMessage(telegramId, message, {
            parse_mode: 'Markdown',
            ...options
        });
    } catch (error) {
        logger.error(`Error sending notification to ${telegramId}:`, error);
    }
}

async function notifyDepositDetected(campaign, depositSOL, signature) {
    const message =
        `✅ *DEPOSIT DETECTED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💰 *Amount:* \`${depositSOL.toFixed(6)} SOL\`\n` +
        `🆔 *Campaign:* \`${campaign.id}\`\n` +
        `⚡ *Status:* \`ACTIVE\`\n\n` +
        `Your campaign has been activated and will begin trading shortly. 🚀\n\n` +
        `🔗 *Tx:* \`${signature.substring(0, 16)}...\``;

    await sendNotification(campaign.telegram_id, message);
}

async function notifyBuyCompleted(campaign, buyResult) {
    const progress = messages.progressBar(buyResult.buyNumber, buyResult.totalBuys);
    const message =
        `✅ *BUY #${buyResult.buyNumber} COMPLETE*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💸 *Spent:* \`$${campaign.per_buy_usd}\`\n` +
        `🪙 *Bought Now:* \`${buyResult.tokensReceived}\`\n` +
        `📦 *Total Pooled:* \`${buyResult.totalAccumulated}\`\n\n` +
        `📈 *PROGRESS:* ${buyResult.buyNumber}/${buyResult.totalBuys}\n` +
        `${progress}\n\n` +
        `🔗 *Swap:* \`${buyResult.swapSignature.substring(0, 12)}...\`\n\n` +
        (buyResult.isComplete
            ? `🎉 *CAMPAIGN FINISHED!*`
            : `⏰ *Next buy in:* \`${campaign.interval_minutes}m\``);


    await sendNotification(campaign.telegram_id, message, {
        reply_markup: {
            inline_keyboard: [[{ text: '📊 Status', callback_data: 'status' }]]
        }
    });
}

async function notifyBuyFailed(campaign, buyNumber, error, walletAddress = null) {
    const userFriendlyError = cleanErrorMessage(error);
    const message =
        `⚠️ *BUY #${buyNumber} FAILED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `❌ *Error:* \`${userFriendlyError}\`\n\n` +
        `🔄 *Action:* Retrying in \`5 minutes\`.\n` +
        `🛡️ *Safety:* Your unspent funds are secure.`;

    await sendNotification(campaign.telegram_id, message);

    // Send wallet address in a separate message for easy copying
    if (walletAddress) {
        await sendNotification(campaign.telegram_id, `📍 *Deposit Wallet:*\n\`${walletAddress}\``);
    }
}

async function notifyCampaignCompleted(campaign) {
    const message =
        `🎉 *CAMPAIGN COMPLETE!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🆔 *Campaign:* \`${campaign.id}\`\n` +
        `📊 *Total Buys:* \`${campaign.number_of_buys}\`\n` +
        `💰 *Total Spent:* \`$${(campaign.number_of_buys * campaign.per_buy_usd).toFixed(2)}\`\n\n` +
        `🏁 All tokens have been delivered to your wallet!\n\n` +
        `🚀 *Start another?* /newcampaign`;

    await sendNotification(campaign.telegram_id, message);
}

module.exports = {
    initializeNotifications,
    notifyDepositDetected,
    notifyBuyCompleted,
    notifyBuyFailed,
    notifyCampaignCompleted
};