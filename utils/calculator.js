const { FEE_PER_BUY_USD } = require('../config/constants');
const price = require('./price');



function calculateCampaign(totalDepositUSD, numberOfBuys) {
    const totalServiceFees = numberOfBuys * FEE_PER_BUY_USD;

    // Customer's full deposit (minus service fees) goes to token buys
    // Gas fees are paid by the service operator from collected fees
    const availableForBuys = totalDepositUSD - totalServiceFees;

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
        availableForBuys: availableForBuys > 0 ? availableForBuys : 0,
        perBuyAmount: perBuyAmount,
        expectedDepositSOL: 0 // Handled in commands.js
    };
}

module.exports = {
    calculateCampaign
};