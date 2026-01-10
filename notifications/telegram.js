const logger = require('../utils/logger');

let botInstance = null;

function initializeNotifications(bot) {
    botInstance = bot;
    logger.info('✅ Telegram notifications initialized');
}

async function sendNotification(telegramId, message, options = {}) {
    if (!botInstance) {
        logger.error('Bot instance not initialized for notifications');
        return;
    }
    
    try {
        await botInstance.sendMessage(telegramId, message, options);
    } catch (error) {
        logger.error(`Error sending notification to ${telegramId}:`, error);
    }
}

async function notifyDepositDetected(campaign, depositSOL, signature) {
    const message = 
        `✅ Deposit Detected!\n\n` +
        `Amount: ${depositSOL} SOL\n` +
        `Campaign ID: ${campaign.id}\n` +
        `Status: ACTIVE\n\n` +
        `Your campaign is now running!\n` +
        `First buy will execute shortly.\n\n` +
        `Tx: ${signature}`;
    
    await sendNotification(campaign.telegram_id, message);
}

async function notifyBuyCompleted(campaign, buyResult) {
    const message = 
        `✅ Buy #${buyResult.buyNumber} Complete!\n\n` +
        `Campaign: ${campaign.id}\n` +
        `Bought: ${buyResult.tokensReceived} tokens\n` +
        `Spent: $${campaign.per_buy_usd}\n` +
        `Progress: ${buyResult.buyNumber}/${buyResult.totalBuys}\n\n` +
        `Swap: ${buyResult.swapSignature.substring(0, 12)}...\n` +
        `Transfer: ${buyResult.transferSignature.substring(0, 12)}...\n\n` +
        (buyResult.isComplete 
            ? `🎉 Campaign Complete!` 
            : `⏰ Next buy in ${campaign.interval_minutes} minutes`);
    
    await sendNotification(campaign.telegram_id, message);
}

async function notifyBuyFailed(campaign, buyNumber, error) {
    const message = 
        `⚠️ Buy #${buyNumber} Failed\n\n` +
        `Campaign: ${campaign.id}\n` +
        `Error: ${error}\n\n` +
        `Don't worry - we'll retry in 5 minutes.\n` +
        `Your funds are safe.`;
    
    await sendNotification(campaign.telegram_id, message);
}

async function notifyCampaignCompleted(campaign) {
    const message = 
        `🎉 Campaign Complete!\n\n` +
        `Campaign ID: ${campaign.id}\n` +
        `Total Buys: ${campaign.number_of_buys}\n` +
        `Total Spent: $${(campaign.number_of_buys * campaign.per_buy_usd).toFixed(2)}\n` +
        `Fees Paid: $${(campaign.number_of_buys * 0.05).toFixed(2)}\n\n` +
        `All tokens have been sent to your wallet!\n\n` +
        `Start another campaign: /newcampaign`;
    
    await sendNotification(campaign.telegram_id, message);
}

module.exports = {
    initializeNotifications,
    notifyDepositDetected,
    notifyBuyCompleted,
    notifyBuyFailed,
    notifyCampaignCompleted
};