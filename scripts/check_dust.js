require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('../database/queries');
const { getAccount } = require('@solana/spl-token');

async function checkDust() {
    console.log('🔍 Auditing campaign wallets for dust...');

    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    const campaigns = await db.getAllCampaigns(100);

    console.log(`📋 Found ${campaigns.length} total campaigns. Checking balances...\n`);
    console.log('ID | Status | SOL Balance | Token Dust | Address');
    console.log('---|--------|-------------|------------|--------');

    for (const campaign of campaigns) {
        try {
            const pubKey = new PublicKey(campaign.deposit_address);
            const balance = await connection.getBalance(pubKey);
            const solBalance = balance / 1e9;

            let tokenDust = 'None';
            if (campaign.token_address) {
                try {
                    // Quick check for ATA
                    const tokenPubKey = new PublicKey(campaign.token_address);
                    const atas = await connection.getTokenAccountsByOwner(pubKey, { mint: tokenPubKey });
                    if (atas.value.length > 0) {
                        const accountInfo = await connection.getTokenAccountBalance(atas.value[0].pubkey);
                        if (accountInfo.value.uiAmount > 0) {
                            tokenDust = `${accountInfo.value.uiAmount} tokens`;
                        }
                    }
                } catch (e) {
                    // Ignore token errors
                }
            }

            console.log(`${campaign.id.toString().padEnd(2)} | ${campaign.status.padEnd(8)} | ${solBalance.toFixed(6)} SOL | ${tokenDust.padEnd(10)} | ${campaign.deposit_address}`);
        } catch (err) {
            console.error(`❌ Error checking campaign ${campaign.id}:`, err.message);
        }
    }

    console.log('\n✅ Audit complete.');
    process.exit(0);
}

checkDust();
