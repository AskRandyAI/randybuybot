const fetch = require('node-fetch');
const logger = require('./logger');

const JUPITER_PRICE_API = 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';

async function getSolPrice() {
    try {
        const response = await fetch(JUPITER_PRICE_API);
        if (!response.ok) {
            throw new Error(`Price API failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Jupiter v2 response format: { data: { "So111...": { id: "...", type: "derivedPrice", price: "123.45" } } }
        const solData = data?.data?.['So11111111111111111111111111111111111111112'];

        if (!solData || !solData.price) {
            throw new Error('Invalid price data format');
        }

        const price = parseFloat(solData.price);
        logger.info(`💰 Current SOL Price: $${price}`);
        return price;

    } catch (error) {
        logger.warn(`Primary price API failed: ${error.message}. Trying backup...`);

        try {
            // Backup: CoinGecko
            const backupResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (!backupResponse.ok) throw new Error('Backup API failed');

            const backupData = await backupResponse.json();
            const backupPrice = backupData?.solana?.usd;

            if (!backupPrice) throw new Error('Invalid backup price data');

            logger.info(`💰 Current SOL Price (Backup): $${backupPrice}`);
            return parseFloat(backupPrice);

        } catch (backupError) {
            logger.error('All price APIs failed:', backupError);
            throw error; // Throw original error
        }
    }
}

module.exports = {
    getSolPrice
};
