const constants = require('../config/constants');
const FEE_PER_BUY_USD = constants.FEE_PER_BUY_USD || 0.05;
const GAS_RESERVE_USD = constants.GAS_RESERVE_USD || 4.00;
const price = require('./price');


function calculateCampaign(totalDepositUSD, numberOfBuys) {
    const totalServiceFees = numberOfBuys * FEE_PER_BUY_USD;

    // Customer's full deposit (minus service fees and gas reserve) goes to token buys
    // Gas reserve is held for future network fees
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