const { FEE_PER_BUY_USD } = require('../config/constants');

function calculateCampaign(totalDepositUSD, numberOfBuys) {
    const totalFees = numberOfBuys * FEE_PER_BUY_USD;
    const availableForBuys = totalDepositUSD - totalFees;
    const perBuyAmount = availableForBuys / numberOfBuys;
    
    // TODO: Get real-time SOL price for accurate conversion
    const solPrice = 200; // Placeholder
    const expectedDepositSOL = totalDepositUSD / solPrice;
    
    return {
        totalDeposit: totalDepositUSD,
        totalFees: totalFees,
        availableForBuys: availableForBuys,
        perBuyAmount: perBuyAmount,
        expectedDepositSOL: expectedDepositSOL
    };
}

module.exports = {
    calculateCampaign
};