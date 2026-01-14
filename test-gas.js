
const calculator = require('./utils/calculator');
const constants = require('./config/constants');

console.log('--- Testing Gas Reserve Removal ---');
console.log('GAS_RESERVE_USD:', constants.GAS_RESERVE_USD);

const totalDeposit = 100;
const buys = 20; // 20 * 0.05 = $1.00 fees
const calc = calculator.calculateCampaign(totalDeposit, buys);

console.log('Input: $100 deposit, 20 buys');
console.log('Total Fees:', calc.totalFees);
console.log('Gas Reserve:', calc.gasReserve);
console.log('Available for Buys:', calc.availableForBuys);
console.log('Expected: $99.00 (100 - 1 service fee - 0 gas)');

if (calc.availableForBuys === 99) {
    console.log('✅ SUCCESS: Gas reserve is no longer being deducted!');
} else {
    console.log('❌ FAILURE: Deduction still occurring.');
}
