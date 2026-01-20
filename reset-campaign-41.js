const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://postgres.uiuktdzragungddoxqva:Okmijnae123$5@aws-0-us-west-2.pooler.supabase.com:6543/postgres';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function resetCampaign41() {
    await pool.query('UPDATE solstice_campaigns SET next_buy_at = NOW(), is_processing = false WHERE id = 41');
    console.log('✅ Campaign 41 reset! Will attempt next buy within 1 minute.');
    process.exit(0);
}

resetCampaign41();
