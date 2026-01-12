const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

async function inspect() {
    const client = new Client({ connectionString });
    try {
        await client.connect();

        console.log('--- COLUMNS ---');
        const colRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'randybuybot_campaigns'");
        console.log(JSON.stringify(colRes.rows, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

inspect();
