const fetch = require('node-fetch');
const logger = require('./logger');

const JUPITER_PRICE_API = 'https://public.jupiterapi.com/price/v2?ids=So11111111111111111111111111111111111111112';

async function getSolPrice() {
    try {
        const response = await fetch(JUPITER_PRICE_API, {
            headers: { 'User-Agent': 'RandyBuyBot/1.0' }
        });
        if (!response.ok) {
            throw new Error(`Price API failed (${response.status}): ${response.statusText}`);
        }

        const data = await response.json();
        const price = data?.data?.SOL?.price || data?.data?.['So11111111111111111111111111111111111111112']?.price;

        if (!price) {
            throw new Error('Invalid price data format');
        }

        const solPrice = parseFloat(price);
        logger.info(`💰 Current SOL Price: $${solPrice}`);
        return solPrice;

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
