require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { initializeBot } = require('./bot/handlers');
const { startDepositMonitor, stopDepositMonitor } = require('./blockchain/monitor');
const { startBuyScheduler, stopBuyScheduler } = require('./scheduler/cron');
const notifications = require('./notifications/telegram');
const logger = require('./utils/logger');
const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database/queries');
const { getSolPrice } = require('./utils/price');

// Validate environment variables
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'SOLANA_RPC_URL',
    'DEPOSIT_WALLET_PRIVATE_KEY',
    'FEE_WALLET_ADDRESS',
    'DASHBOARD_URL'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

logger.info('🤖 Solstice Buy Bot starting...');

// Initialize bot handlers
initializeBot(bot);

// Initialize notifications
notifications.initializeNotifications(bot);

// Start blockchain monitoring
startDepositMonitor();

// Start buy scheduler
startBuyScheduler();

logger.info('✅ RandyBuyBot is running!');

// --- EXPRESS SERVER FOR MINI APP ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// Dashboard API Endpoint
app.get('/api/user-data', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        const [stats, campaigns, solPrice] = await Promise.all([
            db.getUserStats(userId),
            db.getUserActiveCampaigns(userId),
            getSolPrice()
        ]);

        res.json({
            solPrice,
            totalManaged: stats ? parseFloat(stats.total_spent_usd) : 0,
            totalBuys: stats ? parseInt(stats.total_buys) : 0,
            campaigns: campaigns || []
        });
    } catch (err) {
        logger.error('Dashboard API Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Serve Dashboard
app.get('(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

const server = app.listen(PORT, () => {
    logger.info(`🌐 Dashboard API running on port ${PORT}`);
});

// Handle process termination
process.on('SIGINT', async () => {
    logger.info('🛑 Shutting down RandyBuyBot...');
    stopDepositMonitor();
    stopBuyScheduler();
    await bot.stopPolling();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
});