const { Connection, PublicKey } = require('@solana/web3.js');
const { getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
require('dotenv').config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function checkAccount(addressStr) {
    try {
        const pubkey = new PublicKey(addressStr);
        console.log(`Checking account: ${addressStr}`);

        const info = await connection.getAccountInfo(pubkey);
        if (!info) {
            console.log('❌ Account does not exist on-chain.');
            return;
        }

        console.log(`Owner: ${info.owner.toString()}`);
        console.log(`Data length: ${info.data.length} bytes`);
        console.log(`Lamports: ${info.lamports / 1e9} SOL`);

        // Try to parse as Token account
        try {
            const tokenAccount = await getAccount(connection, pubkey, 'confirmed', TOKEN_PROGRAM_ID);
            console.log('✅ Found as Standard Token Account');
            console.log(`   Mint: ${tokenAccount.mint.toString()}`);
            console.log(`   Amount: ${tokenAccount.amount.toString()}`);
        } catch (e) {
            console.log('❌ Not a Standard Token Account or Owner mismatch.');
        }

        try {
            const t2022Account = await getAccount(connection, pubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
            console.log('✅ Found as Token-2022 Account');
            console.log(`   Mint: ${t2022Account.mint.toString()}`);
            console.log(`   Amount: ${t2022Account.amount.toString()}`);
        } catch (e) {
            console.log('❌ Not a Token-2022 Account or Owner mismatch.');
        }

    } catch (error) {
        console.error('Error during check:', error);
    }
}

// The account reported in the logs
const ATA_TO_CHECK = 'CCatHQ4LJJyaiX4WfkyteQcGpZH99XhECLB7F3qcNuUf';
checkAccount(ATA_TO_CHECK);
