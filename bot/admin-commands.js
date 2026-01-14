const db = require('../database/queries');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Check if user is admin
function isAdmin(userId) {
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (!adminId) {
        logger.warn('ADMIN_TELEGRAM_ID not set in .env');
        return false;
    }
    return userId.toString() === adminId.toString();
}

// /admin_stats - System statistics
async function handleAdminStats(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const stats = await db.getSystemStats();

        const message =
            '🔐 *ADMIN DASHBOARD*\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '👥 *USERS*\n' +
            `   • Total: ${stats.total_users}\n\n` +
            '📊 *CAMPAIGNS*\n' +
            `   • Active: ${stats.active_campaigns}\n` +
            `   • Pending: ${stats.pending_campaigns}\n` +
            `   • Completed: ${stats.completed_campaigns}\n\n` +
            '💰 *TRADING VOLUME*\n' +
            `   • Successful Buys: ${stats.successful_buys}\n` +
            `   • Failed Buys: ${stats.failed_buys}\n` +
            `   • Total Volume: \`$${parseFloat(stats.total_volume_usd).toFixed(2)}\`\n\n` +
            '⛽ *GAS & FEES*\n' +
            `   • Fees Collected: \`${parseFloat(stats.total_fees_collected_sol).toFixed(4)} SOL\`\n` +
            `   • Avg Gas/Tx: \`${parseFloat(stats.avg_gas_per_tx_sol).toFixed(6)} SOL\`\n\n` +
            `_Updated: ${new Date().toLocaleString()}_`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: 'admin_stats' }],
                    [{ text: '📋 View Campaigns', callback_data: 'admin_campaigns' }],
                    [{ text: '⚠️ View Errors', callback_data: 'admin_errors' }]
                ]
            }
        });

    } catch (error) {
        logger.error('Admin stats error:', error);
        await bot.sendMessage(chatId, '❌ Error fetching stats');
    }
}

// /admin_campaigns - List all campaigns
async function handleAdminCampaigns(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const campaigns = await db.getAllCampaigns(20);

        if (!campaigns || campaigns.length === 0) {
            await bot.sendMessage(chatId, '📋 No campaigns found');
            return;
        }

        let message = '📋 *RECENT CAMPAIGNS* (Last 20)\n━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        for (const c of campaigns) {
            const statusEmoji = {
                'active': '🟢',
                'awaiting_deposit': '🟡',
                'completed': '✅',
                'cancelled': '🔴',
                'paused': '⏸️'
            }[c.status] || '⚪';

            message += `${statusEmoji} *ID ${c.id}* | @${c.username || 'unknown'}\n`;
            message += `   Token: \`${c.token_address.substring(0, 12)}...\`\n`;
            message += `   Progress: ${c.buys_completed}/${c.number_of_buys} | $${c.total_deposit_usd}\n`;
            message += `   Status: \`${c.status}\`\n\n`;
        }

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });

    } catch (error) {
        logger.error('Admin campaigns error:', error);
        await bot.sendMessage(chatId, '❌ Error fetching campaigns');
    }
}

// /admin_user <telegram_id> - View specific user history
async function handleAdminUser(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    const args = msg.text.split(' ');
    if (args.length < 2) {
        await bot.sendMessage(chatId, '❌ Usage: /admin_user <telegram_id>');
        return;
    }

    const targetUserId = args[1];

    try {
        const stats = await db.getUserStats(targetUserId);
        const fullHistory = await db.getUserFullHistory(targetUserId);

        if (!fullHistory || fullHistory.length === 0) {
            await bot.sendMessage(chatId, `📜 No history found for user ${targetUserId}`);
            return;
        }

        let message = `🔍 *USER: ${targetUserId}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `📈 Campaigns: ${stats.total_campaigns}\n`;
        message += `💰 Total Spent: \`$${parseFloat(stats.total_spent_usd).toFixed(2)}\`\n`;
        message += `✅ Successful Buys: ${stats.successful_buys}\n`;
        message += `❌ Failed Buys: ${stats.failed_buys}\n`;
        message += `⛽ Gas Fees: \`${parseFloat(stats.total_fees_sol).toFixed(4)} SOL\`\n\n`;

        // Show recent campaigns
        const campaigns = {};
        for (const row of fullHistory) {
            if (!campaigns[row.campaign_id]) {
                campaigns[row.campaign_id] = {
                    id: row.campaign_id,
                    token: row.token_address,
                    status: row.campaign_status,
                    buysCompleted: row.buys_completed,
                    totalBuys: row.number_of_buys
                };
            }
        }

        message += `📋 *Recent Campaigns:*\n`;
        const recentCampaigns = Object.values(campaigns).slice(0, 5);
        for (const camp of recentCampaigns) {
            message += `   • ID ${camp.id}: ${camp.buysCompleted}/${camp.totalBuys} - \`${camp.status}\`\n`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        logger.error('Admin user lookup error:', error);
        await bot.sendMessage(chatId, '❌ Error fetching user data');
    }
}

// /admin_errors - View recent errors
async function handleAdminErrors(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const errors = await db.getRecentErrors(10);

        if (!errors || errors.length === 0) {
            await bot.sendMessage(chatId, '✅ No recent errors!');
            return;
        }

        let message = '⚠️ *RECENT ERRORS* (Last 10)\n━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        for (const err of errors) {
            const date = new Date(err.executed_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            message += `❌ *${date}*\n`;
            message += `   User: ${err.telegram_id}\n`;
            message += `   Campaign: ${err.campaign_id}\n`;
            message += `   Token: \`${err.token_address.substring(0, 12)}...\`\n`;
            message += `   Amount: $${err.amount_usd}\n`;

            const shortError = err.error_message.length > 60
                ? err.error_message.substring(0, 60) + '...'
                : err.error_message;
            message += `   Error: \`${shortError}\`\n\n`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        logger.error('Admin errors view error:', error);
        await bot.sendMessage(chatId, '❌ Error fetching error logs');
    }
}

// /admin_logs - View recent log file
async function handleAdminLogs(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        const today = new Date().toISOString().split('T')[0];
        const errorLogFile = path.join(logsDir, `error-${today}.log`);

        if (!fs.existsSync(errorLogFile)) {
            await bot.sendMessage(chatId, '✅ No error logs for today!');
            return;
        }

        const logContent = fs.readFileSync(errorLogFile, 'utf8');
        const lines = logContent.split('\n').filter(l => l.trim()).slice(-20);

        if (lines.length === 0) {
            await bot.sendMessage(chatId, '✅ Error log is empty!');
            return;
        }

        let message = `📄 *ERROR LOG* (Last 20 entries)\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const line of lines) {
            try {
                const log = JSON.parse(line);
                message += `⚠️ ${log.timestamp}\n\`${log.message}\`\n\n`;
            } catch {
                // If not JSON, just show raw line
                message += `${line.substring(0, 100)}\n\n`;
            }
        }

        // Telegram message limit is 4096 chars
        if (message.length > 4000) {
            message = message.substring(0, 4000) + '\n\n_...truncated_';
        }

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        logger.error('Admin logs view error:', error);
        await bot.sendMessage(chatId, '❌ Error reading log files');
    }
}

// /admin_pause - Pause all trading
async function handleAdminPause(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const count = await db.pauseAllCampaigns();
        await bot.sendMessage(
            chatId,
            `⏸️ *TRADING PAUSED*\n\n${count} active campaigns have been paused.\n\nUse /admin_resume to resume.`,
            { parse_mode: 'Markdown' }
        );
        logger.warn(`Admin ${userId} paused all trading (${count} campaigns)`);
    } catch (error) {
        logger.error('Admin pause error:', error);
        await bot.sendMessage(chatId, '❌ Error pausing campaigns');
    }
}

// /admin_resume - Resume all trading
async function handleAdminResume(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    try {
        const count = await db.resumeAllCampaigns();
        await bot.sendMessage(
            chatId,
            `▶️ *TRADING RESUMED*\n\n${count} paused campaigns have been resumed.`,
            { parse_mode: 'Markdown' }
        );
        logger.info(`Admin ${userId} resumed all trading (${count} campaigns)`);
    } catch (error) {
        logger.error('Admin resume error:', error);
        await bot.sendMessage(chatId, '❌ Error resuming campaigns');
    }
}

// /admin_fee <amount_sol> - Update fee amount
async function handleAdminFee(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Unauthorized. Admin access only.');
        return;
    }

    const args = msg.text.split(' ');
    if (args.length < 2) {
        await bot.sendMessage(chatId, '❌ Usage: /admin_fee <amount_sol>\nExample: /admin_fee 0.001');
        return;
    }

    const newFee = parseFloat(args[1]);
    if (isNaN(newFee) || newFee < 0) {
        await bot.sendMessage(chatId, '❌ Invalid fee amount');
        return;
    }

    try {
        await db.updateAdminSetting('fee_per_buy_sol', newFee.toString());
        await bot.sendMessage(
            chatId,
            `✅ *FEE UPDATED*\n\nNew fee per buy: \`${newFee} SOL\``,
            { parse_mode: 'Markdown' }
        );
        logger.info(`Admin ${userId} updated fee to ${newFee} SOL`);
    } catch (error) {
        logger.error('Admin fee update error:', error);
        await bot.sendMessage(chatId, '❌ Error updating fee');
    }
}

module.exports = {
    isAdmin,
    handleAdminStats,
    handleAdminCampaigns,
    handleAdminUser,
    handleAdminErrors,
    handleAdminLogs,
    handleAdminPause,
    handleAdminResume,
    handleAdminFee
};
