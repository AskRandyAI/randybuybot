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
    
    schedulerTask = cron.schedule('* * * * *', async () => {
        await checkForDueBuys();
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
        
        const result = await executeBuy(campaign);
        
        if (result.success) {
            logger.info(`✅ Buy successful for campaign ${campaign.id}`);
            
            if (!result.isComplete) {
                const nextBuyTime = new Date(Date.now() + campaign.interval_minutes * 60 * 1000);
                await db.updateNextBuyTime(campaign.id, nextBuyTime);
                logger.info(`Next buy for campaign ${campaign.id} scheduled at ${nextBuyTime}`);
            } else {
                logger.info(`🎉 Campaign ${campaign.id} completed!`);
            }
            
        } else {
            logger.error(`❌ Buy failed for campaign ${campaign.id}: ${result.error}`);
            
            const retryTime = new Date(Date.now() + 5 * 60 * 1000);
            await db.updateNextBuyTime(campaign.id, retryTime);
            logger.info(`Retry scheduled for campaign ${campaign.id} at ${retryTime}`);
        }
        
    } catch (error) {
        logger.error(`Error processing campaign ${campaign.id}:`, error);
    }
}

module.exports = {
    startBuyScheduler,
    stopBuyScheduler
};