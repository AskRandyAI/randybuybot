require('dotenv').config();
const { Pool } = require('pg');

async function resetTimer(campaignId) {
    if (!campaignId) {
        console.error('Usage: node reset-timer.js <campaignId>');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres.uiuktdzragungddoxqva:Okmijnae123$5@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log(`🔄 Resetting timer for Campaign #${campaignId}...`);
        await pool.query('UPDATE solstice_campaigns SET next_buy_at = NOW(), status = \'active\' WHERE id = $1', [campaignId]);
        console.log(`✅ Success! Campaign #${campaignId} is now set to buy NOW.`);
    } catch (error) {
        console.error('❌ Failed to reset timer:', error.message);
    } finally {
        await pool.end();
    }
}

const id = process.argv[2];
resetTimer(id);
