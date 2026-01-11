const pool = require('./connection');
const logger = require('../utils/logger');

// Get or create user
async function getOrCreateUser(telegramId, username, destinationWallet) {
    try {
        const result = await pool.query(
            `INSERT INTO randybuybot_users (telegram_id, username, destination_wallet)
             VALUES ($1, $2, $3)
             ON CONFLICT (telegram_id)
             DO UPDATE SET destination_wallet = $3, updated_at = NOW()
             RETURNING *`,
            [telegramId, username, destinationWallet]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating user:', error);
        throw error;
    }
}

// Create campaign
async function createCampaign(campaignData) {
    try {
        const result = await pool.query(
            `INSERT INTO randybuybot_campaigns
             (telegram_id, token_address, destination_wallet, total_deposit_usd,
              number_of_buys, interval_minutes, total_fees_usd, per_buy_usd,
              expected_deposit_sol, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'awaiting_deposit')
             RETURNING *`,
            [
                campaignData.telegramId,
                campaignData.tokenAddress,
                campaignData.destinationWallet,
                campaignData.totalDeposit,
                campaignData.numberOfBuys,
                campaignData.interval,
                campaignData.totalFees,
                campaignData.perBuyAmount,
                campaignData.expectedDepositSOL
            ]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating campaign:', error);
        throw error;
    }
}

// Get active campaign for user
async function getActiveCampaign(telegramId) {
    try {
        const result = await pool.query(
            `SELECT * FROM randybuybot_campaigns
             WHERE telegram_id = $1
             AND status IN ('awaiting_deposit', 'active')
             ORDER BY created_at DESC
             LIMIT 1`,
            [telegramId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting active campaign:', error);
        throw error;
    }
}

// Get user buy history
async function getUserBuyHistory(telegramId, limit = 10) {
    try {
        const result = await pool.query(
            `SELECT b.* FROM randybuybot_buys b
             JOIN randybuybot_campaigns c ON b.campaign_id = c.id
             WHERE c.telegram_id = $1
             ORDER BY b.executed_at DESC
             LIMIT $2`,
            [telegramId, limit]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting buy history:', error);
        throw error;
    }
}

// Update campaign status
async function updateCampaignStatus(campaignId, status) {
    try {
        await pool.query(
            `UPDATE randybuybot_campaigns
             SET status = $1, updated_at = NOW()
             WHERE id = $2`,
            [status, campaignId]
        );
    } catch (error) {
        logger.error('Error updating campaign status:', error);
        throw error;
    }
}

// Get admin setting
async function getAdminSetting(key) {
    try {
        const result = await pool.query(
            `SELECT value FROM randybuybot_admin_settings WHERE key = $1`,
            [key]
        );
        return result.rows[0]?.value || null;
    } catch (error) {
        logger.error('Error getting admin setting:', error);
        throw error;
    }
}

// Get campaign by ID
async function getCampaignById(campaignId) {
    const result = await pool.query(
        `SELECT * FROM randybuybot_campaigns WHERE id = $1 LIMIT 1`,
        [campaignId]
    );
    return result.rows[0] || null;
}

// Get campaigns awaiting deposit
async function getAwaitingDepositCampaigns(limit = 25) {
    const result = await pool.query(
        `SELECT * FROM randybuybot_campaigns
         WHERE status = 'awaiting_deposit'
         ORDER BY created_at ASC
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// Update campaign deposit info
async function updateCampaignDeposit(campaignId, actualDepositSOL, signature) {
    try {
        await pool.query(
            `UPDATE randybuybot_campaigns 
             SET actual_deposit_sol = $1, 
                 deposit_signature = $2,
                 next_buy_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [actualDepositSOL, signature, campaignId]
        );
    } catch (error) {
        logger.error('Error updating campaign deposit:', error);
        throw error;
    }
}

// Create buy record
async function createBuy(buyData) {
    try {
        const result = await pool.query(
            `INSERT INTO randybuybot_buys 
             (campaign_id, swap_signature, transfer_signature, amount_usd, 
              amount_sol, tokens_received, fee_paid_sol, status, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                buyData.campaignId,
                buyData.swapSignature || null,
                buyData.transferSignature || null,
                buyData.amountUsd,
                buyData.amountSol || null,
                buyData.tokensReceived || null,
                buyData.feePaidSol || null,
                buyData.status,
                buyData.errorMessage || null
            ]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating buy:', error);
        throw error;
    }
}

// Update campaign progress
async function updateCampaignProgress(campaignId, buysCompleted, status) {
    try {
        await pool.query(
            `UPDATE randybuybot_campaigns 
             SET buys_completed = $1,
                 status = $2::text,
                 updated_at = NOW(),
                 completed_at = CASE WHEN $2::text = 'completed' THEN NOW() ELSE completed_at END
             WHERE id = $3`,
            [buysCompleted, status, campaignId]
        );
    } catch (error) {
        logger.error('Error updating campaign progress:', error);
        throw error;
    }
}

// Get campaigns with buys due
async function getDueCampaigns() {
    try {
        const result = await pool.query(
            `SELECT * FROM randybuybot_campaigns 
             WHERE status = 'active' 
             AND next_buy_at <= NOW()
             ORDER BY next_buy_at ASC`
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting due campaigns:', error);
        throw error;
    }
}

// Update next buy time
async function updateNextBuyTime(campaignId, nextBuyTime) {
    try {
        await pool.query(
            `UPDATE randybuybot_campaigns 
             SET next_buy_at = $1, updated_at = NOW()
             WHERE id = $2`,
            [nextBuyTime, campaignId]
        );
    } catch (error) {
        logger.error('Error updating next buy time:', error);
        throw error;
    }
}

module.exports = {
    getOrCreateUser,
    createCampaign,
    getActiveCampaign,
    getUserBuyHistory,
    updateCampaignStatus,
    getAdminSetting,
    getCampaignById,
    getAwaitingDepositCampaigns,
    updateCampaignDeposit,
    createBuy,
    updateCampaignProgress,
    getDueCampaigns,
    updateNextBuyTime
};