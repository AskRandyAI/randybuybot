const commands = require('./commands');
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

        // Skip if it's a command (let onText handlers process commands)
        if (msg.text && msg.text.startsWith('/')) return;

        // Handle campaign setup flow for non-command messages
        if (userState && userState.isSettingUp) {
            await commands.handleCampaignSetupStep(bot, msg, userStates);
        }
    });

    // Handle callback queries (Inline Buttons)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        // Answer callback to stop loading animation
        await bot.answerCallbackQuery(query.id);

        const msg = query.message;
        msg.from = query.from; // Ensure from field is correct for command handlers

        switch (data) {
            case 'new_campaign':
                await commands.handleNewCampaign(bot, msg, userStates);
                break;
            case 'status':
                await commands.handleStatus(bot, msg);
                break;
            case 'help':
                await commands.handleHelp(bot, msg);
                break;
            case 'confirm_campaign':
                await commands.handleConfirm(bot, msg, userStates);
                break;
            case 'cancel_campaign':
                await commands.handleCancel(bot, msg, userStates);
                break;
            case 'history':
                await commands.handleHistory(bot, msg);
                break;
            default:
                // Handle dynamic data if needed
                break;
        }
    });

    logger.info('✅ Telegram bot handlers initialized');
}

module.exports = { initializeBot };