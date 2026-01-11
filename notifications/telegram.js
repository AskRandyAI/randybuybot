const logger = require('../utils/logger');

let botInstance = null;

function initializeNotifications(bot) {
    botInstance = bot;
    logger.info('✅ Telegram notifications initialized');
}

const messages = require('../bot/messages');

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
        `🪙 *Bought:* \`${buyResult.tokensReceived}\` tokens\n\n` +
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

async function notifyBuyFailed(campaign, buyNumber, error) {
    const message =
        `⚠️ *BUY #${buyNumber} FAILED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `❌ *Error:* \`${error}\`\n\n` +
        `🔄 *Action:* Retrying in \`5 minutes\`.\n` +
        `🛡️ *Safety:* Your unspent funds are secure.`;

    await sendNotification(campaign.telegram_id, message);
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