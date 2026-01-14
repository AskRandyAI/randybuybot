
const pool = require('./database/connection');
require('dotenv').config();

async function migrate() {
    console.log('Running database migration...');
    try {
        await pool.query(`
            ALTER TABLE randybuybot_campaigns 
            ADD COLUMN IF NOT EXISTS deposit_address TEXT,
            ADD COLUMN IF NOT EXISTS deposit_private_key TEXT;
        `);
        console.log('✅ Successfully added deposit_address and deposit_private_key columns.');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await pool.end();
    }
}

migrate();
