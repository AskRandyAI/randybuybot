require('dotenv').config();
const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { getDepositKeypair } = require('./blockchain/wallet');

async function forceCreateAta() {
    const mintStr = 'ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump';
    const rpc = process.env.SOLANA_RPC_URL;
    const connection = new Connection(rpc, 'confirmed');
    const depositKeypair = getDepositKeypair();
    const wallet = depositKeypair.publicKey;

    try {
        const mint = new PublicKey(mintStr);
        const ata = await getAssociatedTokenAddress(
            mint,
            wallet,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        console.log(`Target ATA: ${ata.toString()}`);

        const info = await connection.getAccountInfo(ata);
        if (info) {
            console.log('✅ ATA already exists.');
            console.log(`Owner: ${info.owner.toString()}`);
            return;
        }

        console.log('🔨 Creating Token-2022 ATA...');
        const tx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                wallet,
                ata,
                wallet,
                mint,
                TOKEN_2022_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );

        const sig = await connection.sendTransaction(tx, [depositKeypair]);
        console.log(`🚀 Transaction sent! Signature: ${sig}`);

        console.log('⏳ Waiting for confirmation...');
        await connection.confirmTransaction(sig, 'confirmed');
        console.log('✅ ATA Created successfully!');

    } catch (e) {
        console.error('❌ Error creating ATA:', e);
    }
}

forceCreateAta();
