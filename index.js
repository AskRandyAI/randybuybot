require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { initializeBot } = require('./bot/handlers');
const { startDepositMonitor, stopDepositMonitor } = require('./blockchain/monitor');
const { startBuyScheduler, stopBuyScheduler } = require('./scheduler/cron');
const notifications = require('./notifications/telegram');
const logger = require('./utils/logger');

// Validate environment variables
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'SOLANA_RPC_URL',
    'DEPOSIT_WALLET_PRIVATE_KEY',
    'FEE_WALLET_ADDRESS'
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