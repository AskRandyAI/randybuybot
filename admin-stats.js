const db = require('./database/queries');
const pool = require('./database/connection');
const logger = require('./utils/logger');

async function showStats() {
    console.log('📊 RANDYBUYBOT ADMIN DASHBOARD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // 1. User Stats
        const users = await pool.query('SELECT COUNT(*) FROM randybuybot_users');
        console.log(`👥 Total Users: ${users.rows[0].count}`);

        // 2. Campaign Stats
        const active = await pool.query("SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'active'");
        const pending = await pool.query("SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'awaiting_deposit'");
        const completed = await pool.query("SELECT COUNT(*) FROM randybuybot_campaigns WHERE status = 'completed'");

        console.log(`🚀 Active Campaigns: ${active.rows[0].count}`);
        console.log(`⏳ Pending Deposits: ${pending.rows[0].count}`);
        console.log(`✅ Completed: ${completed.rows[0].count}`);

        // 3. Volume Stats
        const volume = await pool.query('SELECT SUM(amount_usd) as total FROM randybuybot_buys WHERE status = \'success\'');
        const fees = await pool.query('SELECT SUM(fee_paid_sol) as total FROM randybuybot_buys WHERE status = \'success\'');

        console.log(`\n💰 Total Volume: $${parseFloat(volume.rows[0].total || 0).toFixed(2)}`);
        console.log(`⛽ Total Fees Collected: ${parseFloat(fees.rows[0].total || 0).toFixed(6)} SOL`);

        // 4. Recent Active Campaigns
        console.log('\n📝 RECENT ACTIVE CAMPAIGNS:');
        const recent = await pool.query(`
            SELECT id, telegram_id, token_address, total_deposit_usd, buys_completed, number_of_buys 
            FROM randybuybot_campaigns 
            WHERE status = 'active' 
            ORDER BY updated_at DESC LIMIT 5
        `);

        if (recent.rows.length === 0) {
            console.log('   (No active campaigns right now)');
        } else {
            recent.rows.forEach(c => {
                console.log(`   ID: ${c.id} | User: ${c.telegram_id} | Token: ${c.token_address.substring(0, 8)}... | Progress: ${c.buys_completed}/${c.number_of_buys} | $${c.total_deposit_usd}`);
            });
        }

    } catch (error) {
        console.error('Error fetching stats:', error);
    } finally {
        process.exit();
    }
}

showStats();
