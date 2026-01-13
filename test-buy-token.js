require('dotenv').config();
const { buyTokens } = require('./blockchain/jupiter');
const logger = require('./utils/logger');

async function runTest() {
    // ---- TEST CONFIGURATION ----
    // Defaulting to USDC for high liquidity to isolate slippage issues
    // User can change this to any token address they want to test
    const TEST_TOKEN = process.argv[2] || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const BUY_AMOUNT_SOL = 0.005; // 0.005 SOL (approx $0.75-1.00)

    console.log('==============================================');
    console.log(`🚀 TESTING JUPITER ULTRA: 0.005 SOL -> ${TEST_TOKEN}`);
    console.log('==============================================');

    try {
        const result = await buyTokens(TEST_TOKEN, BUY_AMOUNT_SOL);

        console.log('\n✅ TEST SUCCESSFUL!');
        console.log(`Signature: https://solscan.io/tx/${result.signature}`);
        console.log(`Tokens Received: ${result.outputAmount}`);
    } catch (error) {
        console.log('\n❌ TEST FAILED!');
        console.error(`Error: ${error.message}`);
        if (error.logs) {
            console.log('Transaction Logs:', JSON.stringify(error.logs, null, 2));
        }
    }
}

runTest();
