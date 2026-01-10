require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { getDepositKeypair } = require('./blockchain/wallet');

async function checkWallet() {
    console.log('🔍 Checking Wallet Configuration...');

    // 1. Check RPC
    const rpcUrl = process.env.SOLANA_RPC_URL;
    console.log(`📡 RPC URL: ${rpcUrl ? 'Set' : 'MISSING'}`);
    if (rpcUrl) console.log(`   URL: ${rpcUrl}`);

    // 2. Check Keypair
    try {
        const keypair = getDepositKeypair();
        const publicKey = keypair.publicKey.toString();

        console.log(`\n🔑 Wallet Public Key: ${publicKey}`);
        console.log(`   (This is the wallet that MUST have SOL)`);

        // 3. Check Balance
        if (rpcUrl) {
            console.log('\n💰 Checking Balance on Blockchain...');
            const connection = new Connection(rpcUrl, 'confirmed');
            const balanceLamports = await connection.getBalance(keypair.publicKey);
            const balanceSOL = balanceLamports / 1000000000;

            console.log(`   Balance: ${balanceSOL} SOL`);

            if (balanceSOL < 0.002) {
                console.log('\n❌ CRITICAL: Balance is too low! Transaction fees require at least 0.002 SOL.');
            } else {
                console.log('\n✅ Wallet has funds.');
            }
        }

    } catch (error) {
        console.error('\n❌ Error checking wallet:', error.message);
    }
}

checkWallet();
