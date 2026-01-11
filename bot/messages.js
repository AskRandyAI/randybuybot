const { FEE_PER_BUY_USD } = require('../config/constants');

function welcomeMessage() {
    return `🤖 Welcome to RandyBuyBot!

I help you DCA into low-cap Solana tokens automatically.

Features:
✅ Minimum $1 buys every 5+ minutes
✅ Only $${FEE_PER_BUY_USD} fee per buy
✅ Tokens sent directly to your wallet
✅ Cancel anytime with refund

Commands:
/newcampaign - Start a new buy campaign
/status - Check campaign progress
/help - Show help

Ready to start? Type /newcampaign`;
}

function helpMessage() {
    return `📚 RandyBuyBot Help

Commands:
/newcampaign - Start new campaign
/status - Check progress
/cancel - Cancel campaign
/history - View buy history
/help - Show this message

Fees: $${FEE_PER_BUY_USD} per buy`;
}

function campaignSummary(campaignData, calc, interval) {
    const duration = (campaignData.numberOfBuys * interval) / 60;
    const hours = Math.floor(duration);
    const minutes = Math.round((duration - hours) * 60);

    return `📊 CAMPAIGN SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━

Token: ${campaignData.tokenAddress.substring(0, 8)}...
Destination: ${campaignData.destinationWallet.substring(0, 8)}...

Financials:
Total deposit: $${calc.totalDeposit.toFixed(2)}
Bot fees: $${calc.totalFees.toFixed(2)} (${campaignData.numberOfBuys} × $${FEE_PER_BUY_USD})
Gas reserve: $${calc.gasReserve.toFixed(2)} (Safe buffer)
Available for buys: $${calc.availableForBuys.toFixed(2)}

Schedule:
Per buy: $${calc.perBuyAmount.toFixed(2)}
Interval: Every ${interval} minutes
Total buys: ${campaignData.numberOfBuys}
Duration: ~${hours}h ${minutes}m

First buy: Immediately after deposit`;
}

module.exports = {
    welcomeMessage,
    helpMessage,
    campaignSummary
};