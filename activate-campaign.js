require('dotenv').config();
const { Pool } = require('pg');

async function activate() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Get the latest campaign ID
    const result = await pool.query('SELECT id FROM randybuybot_campaigns ORDER BY id DESC LIMIT 1');
    const campaignId = result.rows[0].id;
    
    const actualDeposit = 0.081; // The SOL you actually have in wallet
    
    await pool.query(`
        UPDATE randybuybot_campaigns 
        SET status = 'active',
            actual_deposit_sol = $1,
            deposit_signature = 'using_existing_wallet_balance',
            next_buy_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
    `, [actualDeposit, campaignId]);
    
    console.log('✅ Campaign', campaignId, 'activated!');
    console.log('Using wallet balance:', actualDeposit, 'SOL');
    console.log('First buy will execute within 1 minute');
    
    await pool.end();
}

activate();