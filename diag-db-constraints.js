require('dotenv').config();
const { Pool } = require('pg');

async function diag() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Checking randybuybot_campaigns constraints...');
        const result = await pool.query(`
            SELECT 
                column_name, 
                is_nullable, 
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'randybuybot_campaigns'
        `);

        console.log('Column details:');
        result.rows.forEach(row => {
            console.log(`- ${row.column_name}: Nullable=${row.is_nullable}, Default=${row.column_default}`);
        });

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        await pool.end();
    }
}

diag();
