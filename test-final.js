require('dotenv').config();
process.env.JUPITER_API_KEY = '8f650a6b-b9c9-42b3-b249-4ab92c875639';
const { getQuote } = require('./blockchain/jupiter');
const logger = require('./utils/logger');

async function verify() {
    console.log('--- Jupiter Ultra API Verification ---');
    console.log('API Key configured:', process.env.JUPITER_API_KEY ? 'YES' : 'NO');
    console.log('API Key length:', process.env.JUPITER_API_KEY ? process.env.JUPITER_API_KEY.length : 0);

    const WSOL = 'So11111111111111111111111111111111111111112';
    const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixeb6V3Ewp7DxND989Da';
    const amount = '10000000'; // 0.01 SOL

    try {
        console.log(`\nAttempting to get Ultra Order for 0.01 SOL -> BONK...`);
        const order = await getQuote(WSOL, BONK, amount);

        if (order && order.transaction) {
            console.log('✅ SUCCESS! Ultra Order received.');
            console.log('Request ID:', order.requestId);
            console.log('Transaction length:', order.transaction.length);
        } else {
            console.log('❌ FAILED! Order response invalid or missing transaction.');
            console.log(JSON.stringify(order, null, 2));
        }
    } catch (error) {
        console.log('❌ FAILED! Error during Ultra order fetch.');
        console.error(error.stack);
    }
}

verify();
