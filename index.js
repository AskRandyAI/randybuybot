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
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const calculator = require('./utils/calculator');
const validator = require('./utils/validator');
const constants = require('./config/constants');

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

logger.info('🤖 SolsticeBuyer starting...');

// Initialize bot handlers
initializeBot(bot);

// Initialize notifications
notifications.initializeNotifications(bot);

// Start blockchain monitoring
startDepositMonitor();

// Start buy scheduler
startBuyScheduler();

logger.info('✅ SolsticeBuyer is running!');

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

        const [stats, campaigns, solPrice, recentTokens] = await Promise.all([
            db.getUserStats(userId),
            db.getUserActiveCampaigns(userId),
            getSolPrice({ headers: { 'User-Agent': 'SolsticeBuyer/1.0' } }),
            db.getUserRecentTokens(userId)
        ]);

        res.json({
            solPrice,
            totalManaged: stats ? parseFloat(stats.total_spent_usd) : 0,
            totalBuys: stats ? parseInt(stats.total_buys) : 0,
            campaigns: campaigns || [],
            recentTokens: recentTokens || []
        });
    } catch (err) {
        logger.error('Dashboard API Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create Campaign Endpoint
app.post('/api/create-campaign', async (req, res) => {
    try {
        const { userId, username, destinationWallet, tokenAddress, totalDeposit, numberOfBuys, interval } = req.body;

        // 1. Validate Input
        if (!userId || !destinationWallet || !tokenAddress || !totalDeposit || !numberOfBuys || !interval) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        if (!validator.isValidSolanaAddress(destinationWallet)) {
            return res.status(400).json({ error: 'Invalid destination wallet' });
        }
        if (!validator.isValidSolanaAddress(tokenAddress)) {
            return res.status(400).json({ error: 'Invalid token address' });
        }
        if (totalDeposit < 5) return res.status(400).json({ error: 'Minimum deposit is $5' });

        try {
            validator.validateCampaign(totalDeposit, numberOfBuys);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        // 2. Check for existing active campaigns
        const existing = await db.getActiveCampaign(userId);
        if (existing) {
            return res.status(400).json({ error: 'You already have an active campaign.' });
        }

        // 3. Create User if needed
        await db.getOrCreateUser(userId, username, destinationWallet);

        // 4. Calculate Logic
        const calc = calculator.calculateCampaign(totalDeposit, numberOfBuys);
        const currentPrice = await getSolPrice({ headers: { 'User-Agent': 'SolsticeBuyer/1.0' } }).catch(() => null);

        if (!currentPrice) {
            return res.status(500).json({ error: 'Could not fetch SOL price' });
        }

        // Generate Campaign Wallet
        const newKeypair = Keypair.generate();
        const depositAddress = newKeypair.publicKey.toString();
        const depositPrivateKey = bs58.encode(newKeypair.secretKey);

        // Calculate expected SOL
        const realExpectedSolBase = (totalDeposit / currentPrice);
        const dust = (Math.floor(Math.random() * 100) + 1) / 1000000;
        const gasBuffer = constants.GAS_BUFFER_SOL || 0.005;
        const finalExpectedSOL = realExpectedSolBase + gasBuffer + dust;

        const campaignParams = {
            telegramId: userId,
            tokenAddress: tokenAddress,
            destinationWallet: destinationWallet,
            totalDeposit: totalDeposit,
            numberOfBuys: numberOfBuys,
            interval: interval,
            totalFees: calc.totalFees,
            perBuyAmount: calc.perBuyAmount,
            expectedDepositSOL: finalExpectedSOL.toFixed(9),
            depositAddress: depositAddress,
            depositPrivateKey: depositPrivateKey
        };

        const created = await db.createCampaign(campaignParams);

        // 5. Send Telegram Message
        await bot.sendMessage(
            userId,
            '✅ *Campaign Created via Dashboard!* (ID: ' + created.id + ')\n\n' +
            'Please send the EXACT amount below to activate it:\n\n' +
            `👉 \`${created.expected_deposit_sol}\` *SOL*\n\n` +
            `📍 *Address:* \`${depositAddress}\`\n\n` +
            `_(Tap address to copy)_`,
            { parse_mode: 'Markdown' }
        );

        // Also send just the address for easy copy
        await bot.sendMessage(userId, `\`${depositAddress}\``, { parse_mode: 'Markdown' });

        res.json({ success: true, campaignId: created.id });

    } catch (err) {
        logger.error('API Create Campaign Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Serve Dashboard
app.use((req, res, next) => {
    // Basic API health check or skip files that don't exist
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

const server = app.listen(PORT, () => {
    logger.info(`🌐 Dashboard API running on port ${PORT}`);
});

// Handle process termination
process.on('SIGINT', async () => {
    logger.info('🛑 Shutting down SolsticeBuyer...');
    stopDepositMonitor();
    stopBuyScheduler();
    await bot.stopPolling();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
});