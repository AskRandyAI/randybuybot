require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { getDepositKeypair } = require('./blockchain/wallet');

async function diagnostic() {
    try {
        const wallet = getDepositKeypair();
        const publicKey = wallet.publicKey.toString();
        const mint = new PublicKey('ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump');

        console.log('--- ENV CHECK ---');
        console.log('RPC:', process.env.SOLANA_RPC_URL);
        console.log('BOT_WALLET:', publicKey);

        const ata = await getAssociatedTokenAddress(
            mint,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        console.log('\n--- DERIVATION CHECK ---');
        console.log('Mint:', mint.toString());
        console.log('Derived T2022 ATA:', ata.toString());

        if (ata.toString() === 'CCatHQ4LJJyaiX4WfkyteQcGpZH99XhECLB7F3qcNuUf') {
            console.log('✅ MATCHES BOT LOGS!');
        } else {
            console.log('❌ DOES NOT MATCH BOT LOGS (Mismatch with ATzJhm... expected)');
        }

        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const balance = await connection.getBalance(wallet.publicKey);
        console.log('\n--- BALANCE CHECK ---');
        console.log('Balance:', balance / 1e9, 'SOL');

    } catch (e) {
        console.error(e);
    }
}

diagnostic();
