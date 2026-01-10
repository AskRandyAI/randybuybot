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
        logger.error('Error fetching SOL price:', error);
        // Fallback or rethrow? For financial bots, it's often safer to fail than use stale/wrong prices.
        throw error;
    }
}

module.exports = {
    getSolPrice
};
