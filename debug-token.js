require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { getDepositKeypair } = require('./blockchain/wallet');

async function debugToken() {
    const mintStr = 'ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump';
    const rpc = process.env.SOLANA_RPC_URL;
    const connection = new Connection(rpc, 'confirmed');
    const wallet = getDepositKeypair().publicKey;

    try {
        const mint = new PublicKey(mintStr);
        const info = await connection.getAccountInfo(mint);
        console.log(`\n🔍 MINT INFO: ${mintStr}`);
        console.log(`Owner: ${info.owner.toString()}`);

        const isT2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
        console.log(`Is Token-2022? ${isT2022 ? 'YES' : 'NO'}`);

        // Check for Standard ATA
        const classicAta = await getAssociatedTokenAddress(mint, wallet, false, TOKEN_PROGRAM_ID);
        const classicAtaInfo = await connection.getAccountInfo(classicAta);
        console.log(`\nClassic ATA: ${classicAta.toString()}`);
        console.log(`Exists? ${classicAtaInfo ? 'YES' : 'NO'}`);
        if (classicAtaInfo) {
            console.log(`Owner: ${classicAtaInfo.owner.toString()}`);
        }

        // Check for Token-2022 ATA
        const t2022Ata = await getAssociatedTokenAddress(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
        const t2022AtaInfo = await connection.getAccountInfo(t2022Ata);
        console.log(`\nToken-2022 ATA: ${t2022Ata.toString()}`);
        console.log(`Exists? ${t2022AtaInfo ? 'YES' : 'NO'}`);
        if (t2022AtaInfo) {
            console.log(`Owner: ${t2022AtaInfo.owner.toString()}`);
        }

        console.log(`\nWallet: ${wallet.toString()}`);

    } catch (e) {
        console.error('Error:', e);
    }
}

debugToken();
