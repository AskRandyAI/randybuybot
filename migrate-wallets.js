const pool = require('./database/connection');
require('dotenv').config();

async function migrate() {
    console.log('Running database migration...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ ERROR: DATABASE_URL is not set in .env');
        process.exit(1);
    }

    try {
        console.log('Connecting to database...');
        await pool.query('SELECT NOW()'); // Test connection

        console.log('Applying schema changes...');
        await pool.query(`
            ALTER TABLE randybuybot_campaigns 
            ADD COLUMN IF NOT EXISTS deposit_address TEXT,
            ADD COLUMN IF NOT EXISTS deposit_private_key TEXT;
        `);
        console.log('✅ Successfully added deposit_address and deposit_private_key columns.');
    } catch (error) {
        console.error('❌ Migration failed!');
        console.error('Error details:', error);
    } finally {
        await pool.end();
    }
}

migrate();

