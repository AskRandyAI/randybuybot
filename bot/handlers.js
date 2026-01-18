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
    // Admin commands
    bot.onText(/\/admin_stats/, (msg) => admin.handleAdminStats(bot, msg));
    bot.onText(/\/admin_campaigns/, (msg) => admin.handleAdminCampaigns(bot, msg));
    bot.onText(/\/admin_user/, (msg) => admin.handleAdminUser(bot, msg));
    bot.onText(/\/admin_errors/, (msg) => admin.handleAdminErrors(bot, msg));
    bot.onText(/\/admin_logs/, (msg) => admin.handleAdminLogs(bot, msg));
    bot.onText(/\/admin_pause/, (msg) => admin.handleAdminPause(bot, msg));
    bot.onText(/\/admin_resume/, (msg) => admin.handleAdminResume(bot, msg));
    bot.onText(/\/admin_fee/, (msg) => admin.handleAdminFee(bot, msg));

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
            case 'enter_new_wallet':
                await bot.sendMessage(chatId, '📝 *Enter New Wallet*\n\nPlease paste the new Solana address below:', { parse_mode: 'Markdown' });
                break;
            case 'enter_custom_amount':
                await bot.sendMessage(chatId, '📝 *Enter Custom Amount*\n\nPlease type the total deposit amount in USD (e.g., 500):', { parse_mode: 'Markdown' });
                break;
            case 'enter_custom_interval':
                await bot.sendMessage(chatId, '📝 *Enter Custom Interval*\n\nPlease type the buy interval in minutes (e.g., 45):', { parse_mode: 'Markdown' });
                break;
            // Admin callbacks (if any) could be added here
            default:
                // Handle dynamic callbacks (presets and saved wallet)
                const userState = userStates.get(userId);

                // Saved wallet button
                if (data.startsWith('use_wallet_')) {
                    const wallet = data.replace('use_wallet_', '');
                    if (userState && userState.step === 'destination_wallet') {
                        msg.text = wallet;
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                // Saved token button
                else if (data.startsWith('use_token_')) {
                    const token = data.replace('use_token_', '');
                    if (userState && userState.step === 'token_address') {
                        msg.text = token;
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                // Amount presets
                else if (data.startsWith('setup_amount_')) {
                    const amount = data.replace('setup_amount_', '');
                    if (userState && userState.step === 'total_deposit') {
                        msg.text = amount;
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                // Buys presets
                else if (data.startsWith('setup_buys_')) {
                    const buys = data.replace('setup_buys_', '');
                    if (userState && userState.step === 'number_of_buys') {
                        msg.text = buys;
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                // Interval presets
                else if (data.startsWith('setup_interval_')) {
                    const interval = data.replace('setup_interval_', '');
                    if (userState && userState.step === 'interval') {
                        msg.text = interval;
                        await commands.handleCampaignSetupStep(bot, msg, userStates);
                    }
                }
                break;
        }
    });

    logger.info('✅ Telegram bot handlers initialized');
}

module.exports = { initializeBot };