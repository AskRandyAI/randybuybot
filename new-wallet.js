const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');

function generateNewWallet() {
    console.log('🔄 Generating NEW secure wallet...');

    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const secretKey = bs58.encode(keypair.secretKey);

    console.log('\n✅ NEW WALLET GENERATED!');
    console.log('=============================================');
    console.log(`Public Address:  ${publicKey}`);
    console.log(`Private Key:     ${secretKey}`);
    console.log('=============================================');
    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('1. Copy the Private Key above.');
    console.log('2. Open your .env file:  nano .env');
    console.log('3. REPLACE the old DEPOSIT_WALLET_PRIVATE_KEY with this new one.');
    console.log('4. REPLACE the old DEPOSIT_WALLET_ADDRESS with the Public Address.');
    console.log('5. Save and Exit (Ctrl+O, Enter, Ctrl+X).');
    console.log('6. Restart the bot:  pm2 restart all');
}

generateNewWallet();
