require('dotenv').config();
const { Pool } = require('pg');

async function getLatest() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    const result = await pool.query('SELECT id, expected_deposit_sol FROM randybuybot_campaigns ORDER BY id DESC LIMIT 1');
    const campaign = result.rows[0];
    
    console.log('Latest Campaign ID:', campaign.id);
    console.log('Expected deposit:', campaign.expected_deposit_sol, 'SOL');
    
    await pool.end();
}

getLatest();