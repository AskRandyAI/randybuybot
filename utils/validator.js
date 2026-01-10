const { PublicKey } = require('@solana/web3.js');
const { MIN_PER_BUY_USD, FEE_PER_BUY_USD } = require('../config/constants');

function isValidSolanaAddress(address) {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

function validateCampaign(totalDepositUSD, numberOfBuys) {
    const totalFees = numberOfBuys * FEE_PER_BUY_USD;
    const availableForBuys = totalDepositUSD - totalFees;
    const perBuyAmount = availableForBuys / numberOfBuys;
    
    if (perBuyAmount < MIN_PER_BUY_USD) {
        throw new Error(
            `Per-buy amount ($${perBuyAmount.toFixed(2)}) is below minimum ($${MIN_PER_BUY_USD}). ` +
            `Either increase deposit or reduce number of buys.`
        );
    }
    
    return true;
}

module.exports = {
    isValidSolanaAddress,
    validateCampaign
};