require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

async function debugToken() {
    const mint = 'ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump';
    const rpc = process.env.SOLANA_RPC_URL;
    const connection = new Connection(rpc, 'confirmed');

    try {
        const info = await connection.getAccountInfo(new PublicKey(mint));
        console.log(`\n🔍 MINT INFO for ${mint}:`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Owner: ${info.owner.toString()}`);

        if (info.owner.toString() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
            console.log('✅ Standard Token-2022 Program');
        } else if (info.owner.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            console.log('✅ Standard SPL Token Program');
        } else {
            console.log('⚠️ UNKNOWN OWNER (Possible custom program)');
        }

        // Check if ATA exists for our wallet
        const { getDepositKeypair } = require('./blockchain/wallet');
        const wallet = getDepositKeypair().publicKey;
        const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

        const programId = info.owner;
        const ata = await getAssociatedTokenAddress(new PublicKey(mint), wallet, false, programId);
        console.log(`\nWallet: ${wallet.toString()}`);
        console.log(`ATA (${programId === TOKEN_2022_PROGRAM_ID ? 'T2022' : 'Classic'}): ${ata.toString()}`);

        const ataInfo = await connection.getAccountInfo(ata);
        console.log(`ATA Exists? ${ataInfo ? 'YES' : 'NO'}`);

    } catch (e) {
        console.error('Error:', e);
    }
}

debugToken();
