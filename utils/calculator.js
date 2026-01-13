const { FEE_PER_BUY_USD } = require('../config/constants');
const price = require('./price');

// Reserve ~$1 USD for gas fees/rent to prevent stuck wallets
const GAS_RESERVE_USD = 1.00;

function calculateCampaign(totalDepositUSD, numberOfBuys) {
    const totalServiceFees = numberOfBuys * FEE_PER_BUY_USD;

    // Deduct Service Fees AND Gas Reserve
    const availableForBuys = totalDepositUSD - totalServiceFees - GAS_RESERVE_USD;

    let perBuyAmount;

    if (availableForBuys <= 0) {
        // Edge case for very small deposits
        perBuyAmount = 0;
    } else {
        perBuyAmount = availableForBuys / numberOfBuys;
    }

    return {
        totalDeposit: totalDepositUSD,
        totalFees: totalServiceFees,
        gasReserve: GAS_RESERVE_USD,
        availableForBuys: availableForBuys > 0 ? availableForBuys : 0,
        perBuyAmount: perBuyAmount,
        expectedDepositSOL: 0 // Handled in commands.js
    };
}

module.exports = {
    calculateCampaign
};