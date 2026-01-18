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
              expected_deposit_sol, deposit_address, deposit_private_key, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'awaiting_deposit')
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
                campaignData.expectedDepositSOL,
                campaignData.depositAddress,
                campaignData.depositPrivateKey
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

// Get all active campaigns for user
async function getUserActiveCampaigns(telegramId) {
    try {
        const result = await pool.query(
            `SELECT * FROM randybuybot_campaigns
             WHERE telegram_id = $1
             AND status IN ('awaiting_deposit', 'active')
             ORDER BY created_at DESC`,
            [telegramId]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting user active campaigns:', error);
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

// Get total tokens bought for a campaign
async function getTokensBought(campaignId) {
    try {
        const result = await pool.query(
            `SELECT COALESCE(SUM(tokens_received::numeric), 0) as total_tokens
             FROM randybuybot_buys 
             WHERE campaign_id = $1 AND status = 'success'`,
            [campaignId]
        );
        return BigInt(Math.floor(result.rows[0].total_tokens));
    } catch (error) {
        logger.error('Error getting tokens bought:', error);
        throw error;
    }
}


// ===== NEW: Enhanced User History Queries =====

// Get complete user history with all campaigns and transactions
async function getUserFullHistory(telegramId) {
    try {
        const result = await pool.query(
            `SELECT 
                c.id as campaign_id,
                c.token_address,
                c.total_deposit_usd,
                c.number_of_buys,
                c.buys_completed,
                c.status as campaign_status,
                c.created_at as campaign_created,
                c.completed_at,
                c.deposit_signature,
                b.id as buy_id,
                b.swap_signature,
                b.transfer_signature,
                b.amount_usd,
                b.amount_sol,
                b.tokens_received,
                b.fee_paid_sol,
                b.status as buy_status,
                b.executed_at,
                b.error_message
             FROM randybuybot_campaigns c
             LEFT JOIN randybuybot_buys b ON c.id = b.campaign_id
             WHERE c.telegram_id = $1
             ORDER BY c.created_at DESC, b.executed_at DESC`,
            [telegramId]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting user full history:', error);
        throw error;
    }
}

// Get user statistics summary
async function getUserStats(telegramId) {
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(DISTINCT c.id) as total_campaigns,
                COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_campaigns,
                COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as completed_campaigns,
                COUNT(b.id) as total_buys,
                COUNT(CASE WHEN b.status = 'success' THEN 1 END) as successful_buys,
                COUNT(CASE WHEN b.status = 'failed' THEN 1 END) as failed_buys,
                COALESCE(SUM(CASE WHEN b.status = 'success' THEN b.amount_usd END), 0) as total_spent_usd,
                COALESCE(SUM(CASE WHEN b.status = 'success' THEN b.fee_paid_sol END), 0) as total_fees_sol
             FROM randybuybot_campaigns c
             LEFT JOIN randybuybot_buys b ON c.id = b.campaign_id
             WHERE c.telegram_id = $1`,
            [telegramId]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error getting user stats:', error);
        throw error;
    }
}

// ===== NEW: Admin Queries =====

// Get all users with their stats
async function getAllUsers() {
    try {
        const result = await pool.query(
            `SELECT 
                u.telegram_id,
                u.username,
                u.destination_wallet,
                u.created_at,
                COUNT(DISTINCT c.id) as total_campaigns,
                COUNT(b.id) as total_buys,
                COALESCE(SUM(CASE WHEN b.status = 'success' THEN b.amount_usd END), 0) as total_volume_usd
             FROM randybuybot_users u
             LEFT JOIN randybuybot_campaigns c ON u.telegram_id = c.telegram_id
             LEFT JOIN randybuybot_buys b ON c.id = b.campaign_id
             GROUP BY u.telegram_id, u.username, u.destination_wallet, u.created_at
             ORDER BY total_volume_usd DESC`
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting all users:', error);
        throw error;
    }
}

// Get system-wide statistics
async function getSystemStats() {
    try {
        const result = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM randybuybot_users) as total_users,
                (SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'active') as active_campaigns,
                (SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'awaiting_deposit') as pending_campaigns,
                (SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'completed') as completed_campaigns,
                (SELECT COUNT(*) FROM randybuybot_buys WHERE status = 'success') as successful_buys,
                (SELECT COUNT(*) FROM randybuybot_buys WHERE status = 'failed') as failed_buys,
                (SELECT COALESCE(SUM(amount_usd), 0) FROM randybuybot_buys WHERE status = 'success') as total_volume_usd,
                (SELECT COALESCE(SUM(fee_paid_sol), 0) FROM randybuybot_buys WHERE status = 'success') as total_fees_collected_sol,
                (SELECT COALESCE(AVG(fee_paid_sol), 0) FROM randybuybot_buys WHERE status = 'success') as avg_gas_per_tx_sol`
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error getting system stats:', error);
        throw error;
    }
}

// Get recent errors
async function getRecentErrors(limit = 20) {
    try {
        const result = await pool.query(
            `SELECT 
                b.id,
                b.campaign_id,
                c.telegram_id,
                c.token_address,
                b.amount_usd,
                b.error_message,
                b.executed_at
             FROM randybuybot_buys b
             JOIN randybuybot_campaigns c ON b.campaign_id = c.id
             WHERE b.status = 'failed'
             ORDER BY b.executed_at DESC
             LIMIT $1`,
            [limit]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting recent errors:', error);
        throw error;
    }
}

// Update admin setting
async function updateAdminSetting(key, value) {
    try {
        await pool.query(
            `INSERT INTO randybuybot_admin_settings (key, value)
             VALUES ($1, $2)
             ON CONFLICT (key)
             DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, value]
        );
    } catch (error) {
        logger.error('Error updating admin setting:', error);
        throw error;
    }
}

// Pause all active campaigns
async function pauseAllCampaigns() {
    try {
        const result = await pool.query(
            `UPDATE randybuybot_campaigns
             SET status = 'paused', updated_at = NOW()
             WHERE status = 'active'
             RETURNING id`
        );
        return result.rows.length;
    } catch (error) {
        logger.error('Error pausing campaigns:', error);
        throw error;
    }
}

// Resume all paused campaigns
async function resumeAllCampaigns() {
    try {
        const result = await pool.query(
            `UPDATE randybuybot_campaigns
             SET status = 'active', updated_at = NOW()
             WHERE status = 'paused'
             RETURNING id`
        );
        return result.rows.length;
    } catch (error) {
        logger.error('Error resuming campaigns:', error);
        throw error;
    }
}

// Get all campaigns (for admin)
async function getAllCampaigns(limit = 50) {
    try {
        const result = await pool.query(
            `SELECT 
                c.*,
                u.username,
                COUNT(b.id) as total_buys_executed
             FROM randybuybot_campaigns c
             JOIN randybuybot_users u ON c.telegram_id = u.telegram_id
             LEFT JOIN randybuybot_buys b ON c.id = b.campaign_id
             GROUP BY c.id, u.username
             ORDER BY c.updated_at DESC
             LIMIT $1`,
            [limit]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting all campaigns:', error);
        throw error;
    }
}

// Get user last destination wallet
async function getUserLastDestinationWallet(telegramId) {
    try {
        const result = await pool.query(
            `SELECT destination_wallet FROM randybuybot_campaigns
             WHERE telegram_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [telegramId]
        );
        return result.rows[0]?.destination_wallet || null;
    } catch (error) {
        logger.error('Error getting last destination wallet:', error);
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
    updateNextBuyTime,
    getTokensBought,
    // New exports

    getUserFullHistory,
    getUserStats,
    getAllUsers,
    getSystemStats,
    getRecentErrors,
    updateAdminSetting,
    pauseAllCampaigns,
    resumeAllCampaigns,
    getAllCampaigns,
    getUserActiveCampaigns,
    getUserLastDestinationWallet
};