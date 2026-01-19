const cron = require('node-cron');
const db = require('../database/queries');
const { executeBuy } = require('../blockchain/executor');
const logger = require('../utils/logger');

let schedulerTask = null;

function startBuyScheduler() {
    if (schedulerTask) {
        logger.warn('Buy scheduler already running');
        return;
    }

    logger.info('⏰ Starting buy scheduler...');

    // Check for buys every minute
    schedulerTask = cron.schedule('* * * * *', async () => {
        await checkForDueBuys();
    });

    // Sweep dust daily at midnight
    cron.schedule('0 0 * * *', async () => {
        try {
            const { sweepDust } = require('../blockchain/sweeper');
            await sweepDust();
        } catch (e) {
            logger.error('Daily sweep failed:', e);
        }
    });

    logger.info('✅ Buy scheduler started');
}

function stopBuyScheduler() {
    if (schedulerTask) {
        schedulerTask.stop();
        schedulerTask = null;
        logger.info('🛑 Buy scheduler stopped');
    }
}

async function checkForDueBuys() {
    try {
        const dueCampaigns = await db.getDueCampaigns();

        if (dueCampaigns.length === 0) {
            return;
        }

        logger.info(`Found ${dueCampaigns.length} campaigns with buys due`);

        for (const campaign of dueCampaigns) {
            await processCampaignBuy(campaign);
        }

    } catch (error) {
        logger.error('Error checking for due buys:', error);
    }
}

async function processCampaignBuy(campaign) {
    try {
        logger.info(`Processing buy for campaign ${campaign.id}`);

        // 1. Set processing lock
        await db.setCampaignProcessing(campaign.id, true);

        const result = await executeBuy(campaign);

        if (result && result.success) {
            logger.info(`✅ Buy successful for campaign ${campaign.id}`);

            if (!result.isComplete) {
                const nextBuyTime = new Date(Date.now() + campaign.interval_minutes * 60 * 1000);
                await db.updateNextBuyTime(campaign.id, nextBuyTime);
                logger.info(`Next buy for campaign ${campaign.id} scheduled at ${nextBuyTime}`);
            } else {
                logger.info(`🎉 Campaign ${campaign.id} completed!`);
            }

        } else {
            const errorMsg = result ? result.error : 'Unknown error';
            logger.error(`❌ Buy failed for campaign ${campaign.id}: ${errorMsg}`);

            const retryTime = new Date(Date.now() + 5 * 60 * 1000);
            await db.updateNextBuyTime(campaign.id, retryTime);
            logger.info(`Retry scheduled for campaign ${campaign.id} at ${retryTime}`);
        }

        // 2. Lock is removed either inside updateCampaignProgress (on success) 
        //    or here if something failed before update was reached.
        await db.setCampaignProcessing(campaign.id, false);

    } catch (error) {
        logger.error(`Error processing campaign ${campaign.id}:`, error);
        await db.setCampaignProcessing(campaign.id, false).catch(() => { });
    }
}

module.exports = {
    startBuyScheduler,
    stopBuyScheduler
};