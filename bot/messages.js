const { FEE_PER_BUY_USD } = require('../config/constants');

function welcomeMessage() {
    return `🚀 *Welcome to RandyBuyBot v2.0*
━━━━━━━━━━━━━━━━━━━━━━━

The most secure & efficient way to DCA into Solana gems. Your private keys are never exposed, and tokens go straight to your wallet.

✨ *Features:*
• *Capital Safety:* Dedicated deposit wallets
• *Minimal Fees:* Only \`$${FEE_PER_BUY_USD}\` per buy
• *Direct Delivery:* Tokens sent to your wallet
• *Autonomy:* Fully automatic execution

👇 *Choose an option below to begin:*`;
}

function helpMessage() {
    return `📚 *COMMAND CENTER*
━━━━━━━━━━━━━━━━━━━━━━━

🚀 /newcampaign \- Start a new DCA run
📊 /status \- Monitor live progress
📜 /history \- View past trade performance
❌ /cancel \- Stop campaign & refund

📈 *Fees:* \`$${FEE_PER_BUY_USD}\` per buy 
⛽ *Gas Buffer:* \`$4.00\` (Reserved for network safety)`;
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
• Gas Reserve: \`$${(calc.gasReserve || 0).toFixed(2)}\`
• Net Capital: \`$${(calc.availableForBuys || 0).toFixed(2)}\`

⏰ *SCHEDULE*
• Per Buy: \`$${(calc.perBuyAmount || 0).toFixed(2)}\`

• Interval: \`Every ${interval}m\`
• Total Buys: \`${campaignData.numberOfBuys}\`
• Duration: \`~${hours}h ${minutes}m\`

_Confirm your campaign to generate the deposit address._`;
}

module.exports = {
    welcomeMessage,
    helpMessage,
    campaignSummary,
    progressBar
};