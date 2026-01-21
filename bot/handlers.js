const commands = require('./commands');
const admin = require('./admin-commands');
const logger = require('../utils/logger');

// User state management
const userStates = new Map();

function initializeBot(bot) {
    // Command handlers
    bot.onText(/\/start/, (msg) => commands.handleStart(bot, msg));
    bot.onText(/\/newcampaign/, (msg) => commands.handleNewCampaign(bot, msg, userStates));
    bot.onText(/\/confirm/, (msg) => commands.handleConfirm(bot, msg, userStates));
    bot.onText(/\/status/, (msg) => commands.handleStatus(bot, msg));
    bot.onText(/\/cancel/, (msg) => commands.handleCancel(bot, msg, userStates));
    bot.onText(/\/history/, (msg) => commands.handleHistory(bot, msg));
    bot.onText(/\/help/, (msg) => commands.handleHelp(bot, msg));

    // Handle user messages during campaign setup
    bot.on('message', async (msg) => {
        const userId = msg.from.id;
        const userState = userStates.get(userId);
        if (msg.text && msg.text.startsWith('/')) return;
        if (userState && userState.isSettingUp) {
            await commands.handleCampaignSetupStep(bot, msg, userStates);
        }
    });

    // Handle callback queries (Inline Buttons)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        await bot.answerCallbackQuery(query.id);

        const msg = query.message;
        msg.from = query.from;

        switch (data) {
            case 'new_campaign': await commands.handleNewCampaign(bot, msg, userStates); break;
            case 'status': await commands.handleStatus(bot, msg); break;
            case 'help': await commands.handleHelp(bot, msg); break;
            case 'confirm_campaign': await commands.handleConfirm(bot, msg, userStates); break;
            case 'cancel_campaign':
            case 'cancel': await commands.handleCancel(bot, msg, userStates); break;
            case 'history': await commands.handleHistory(bot, msg); break;
            case 'close_menu': await bot.deleteMessage(chatId, msg.message_id); break;

            default:
                if (data.startsWith('finish_anyway_')) {
                    await commands.handleFinishAnyway(bot, query, data.replace('finish_anyway_', ''));
                } else if (data.startsWith('refund_cancel_')) {
                    await commands.handleCancel(bot, msg, userStates);
                } else if (data.startsWith('use_wallet_')) {
                    const uState = userStates.get(userId);
                    if (uState && uState.step === 'destination_wallet') {
                        msg.text = data.replace('use_wallet_', '');
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                } else if (data.startsWith('use_token_')) {
                    const uState = userStates.get(userId);
                    if (uState && uState.step === 'token_address') {
                        msg.text = data.replace('use_token_', '');
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                } else if (data.startsWith('setup_amount_')) {
                    const uState = userStates.get(userId);
                    if (uState && uState.step === 'total_deposit') {
                        msg.text = data.replace('setup_amount_', '');
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                } else if (data.startsWith('setup_buys_')) {
                    const uState = userStates.get(userId);
                    if (uState && uState.step === 'number_of_buys') {
                        msg.text = data.replace('setup_buys_', '');
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                } else if (data.startsWith('setup_interval_')) {
                    const uState = userStates.get(userId);
                    if (uState && uState.step === 'interval') {
                        msg.text = data.replace('setup_interval_', '');
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                break;
        }
    });

    logger.info('✅ Telegram bot handlers initialized');
}

module.exports = { initializeBot };