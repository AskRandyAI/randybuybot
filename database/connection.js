const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    logger.info('✅ Database connected');
});

pool.on('error', (err) => {
    logger.error('Database error:', err);
});

module.exports = pool;