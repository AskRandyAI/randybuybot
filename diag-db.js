require('dotenv').config();
const { Pool } = require('pg');

async function diag() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Checking randybuybot_campaigns table structure...');
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'randybuybot_campaigns'
        `);

        if (result.rows.length === 0) {
            console.error('❌ Table randybuybot_campaigns not found!');
        } else {
            console.log('Table columns:');
            result.rows.forEach(row => {
                console.log(`- ${row.column_name} (${row.data_type})`);
            });
        }
    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        await pool.end();
    }
}

diag();
