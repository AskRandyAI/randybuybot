const { FEE_PER_BUY_USD } = require('../config/constants');

function welcomeMessage() {
    return `🌞 *SOLSTICEBUYER*
━━━━━━━━━━━━━━━━━━━━━━━

*The premium autonomous trading terminal for Solana.*

Solstice automates your token accumulation with military-grade security and stealth execution.

💎 *ELITE FEATURES*
━━━━━━━━━━━━━━
🔒 *Unique Deposit Wallets*
Every campaign gets a fresh, isolated wallet. Your main funds stay untouched.

👻 *Stealth Execution*
Buys are split into small, random amounts to avoid detection and price pumps.

⚡ *Turbo Mode*
Intervals as fast as 1 minute for rapid accumulation.

🧹 *Auto-Sweep*
Tokens are automatically sent to your destination wallet when finished.

💸 *Cost Efficiency*
Only \`$${FEE_PER_BUY_USD}\` fee per buy.

👇 *Select an option to begin:*`;
}

function helpMessage() {
    return `📚 * COMMAND CENTER *
━━━━━━━━━━━━━━━━━━━━━━━

🚀 /newcampaign \- Start a new DCA run
📊 /status \- Monitor live progress
📜 /history \- View past trade performance
❌ /cancel \- Stop campaign & refund

📈 * Fees:* \`$${FEE_PER_BUY_USD}\` per buy
`;
}

function progressBar(current, total) {
    const size = 10;
    const progress = Math.min(Math.max(Math.round((current / total) * size), 0), size);
    const empty = size - progress;
    return '`[' + '■'.repeat(progress) + '□'.repeat(empty) + ']`';
}

function campaignSummary(campaignData, calc, interval) {
    const duration = (campaignData.numberOfBuys * interval) / 60;
    const hours = Math.floor(duration);
    const minutes = Math.round((duration - hours) * 60);

    return `📝 *CAMPAIGN INVOICE*
━━━━━━━━━━━━━━━━━━━━━━━

🔹 *TOKEN:* \`${campaignData.tokenAddress.substring(0, 8)}...\`
🔹 *DEST:* \`${campaignData.destinationWallet.substring(0, 8)}...\`

💰 *FINANCIALS*
• Total Deposit: \`$${(calc.totalDeposit || 0).toFixed(2)}\`
• Bot Fees: \`$${(calc.totalFees || 0).toFixed(2)}\`
• Net Capital: \`$${(calc.availableForBuys || 0).toFixed(2)}\`


⏰ *SCHEDULE*
• Per Buy: \`$${(calc.perBuyAmount || 0).toFixed(2)}\`

• Interval: \`Every ${interval}m\`
• Total Buys: \`${campaignData.numberOfBuys}\`
• Duration: \`~${hours}h ${minutes}m\`


_Confirm your campaign to generate the deposit address. A small SOL buffer (0.01) will be added to the total for network gas fees._`;
}

module.exports = {
    welcomeMessage,
    helpMessage,
    campaignSummary,
    progressBar
};