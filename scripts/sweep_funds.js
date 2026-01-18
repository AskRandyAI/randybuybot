require('dotenv').config();
const {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction
} = require('@solana/web3.js');
const { transferTokens } = require('../blockchain/jupiter');
const db = require('../database/queries');
const bs58 = require('bs58');

async function sweepFunds() {
    console.log('🧹 Starting GLOBAL FUND SWEEP...');

    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    const destinationAddress = process.env.FEE_WALLET_ADDRESS || process.env.DEPOSIT_WALLET_ADDRESS;

    if (!destinationAddress) {
        console.error('❌ Error: No destination wallet found in .env (FEE_WALLET_ADDRESS or DEPOSIT_WALLET_ADDRESS).');
        process.exit(1);
    }

    const destinationPubKey = new PublicKey(destinationAddress);
    console.log(`🎯 Destination Wallet: ${destinationAddress}`);

    // Fetch campaigns that are likely to have dust (completed, failed, or just old)
    const campaigns = await db.getAllCampaigns(200);
    const inactiveCampaigns = campaigns.filter(c => c.status !== 'active' && c.status !== 'awaiting_deposit');

    console.log(`📋 Found ${inactiveCampaigns.length} inactive campaigns to audit.\n`);

    for (const campaign of inactiveCampaigns) {
        try {
            if (!campaign.deposit_private_key) continue;

            const depositKeypair = Keypair.fromSecretKey(bs58.decode(campaign.deposit_private_key));
            const pubKey = depositKeypair.publicKey;

            // 1. Check SOL Balance
            const balance = await connection.getBalance(pubKey);
            const solAmount = balance / 1e9;

            if (solAmount < 0.001) {
                // Not enough even to pay for a transfer fee, skip
                continue;
            }

            console.log(`📦 Auditing Wallet: ${pubKey.toString()} (Campaign #${campaign.id})`);

            // 2. Check for SPL Tokens first (Sweep tokens before SOL runs out)
            try {
                const tokenAccounts = await connection.getTokenAccountsByOwner(pubKey, {
                    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
                });

                for (const account of tokenAccounts.value) {
                    const accountInfo = await connection.getTokenAccountBalance(account.pubkey);
                    if (accountInfo.value.uiAmount > 0) {
                        const mint = (await connection.getParsedAccountInfo(account.pubkey)).value.data.parsed.info.mint;
                        console.log(`   ✨ Found ${accountInfo.value.uiAmount} tokens (Mint: ${mint}). Sweeping...`);

                        await transferTokens(
                            mint,
                            accountInfo.value.amount,
                            destinationAddress,
                            depositKeypair
                        );
                    }
                }
            } catch (tokenErr) {
                console.warn(`   ⚠️ Token sweep skipped for this wallet: ${tokenErr.message}`);
            }

            // 3. Sweep Remaining SOL (minus 0.000005 fee)
            const sweepAmount = balance - 5000;
            if (sweepAmount > 0) {
                console.log(`   💰 Sweeping ${sweepAmount / 1e9} SOL...`);

                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: pubKey,
                        toPubkey: destinationPubKey,
                        lamports: sweepAmount,
                    })
                );

                const signature = await sendAndConfirmTransaction(connection, transaction, [depositKeypair]);
                console.log(`   ✅ SOL Swept! Tx: ${signature}`);
            }

        } catch (err) {
            console.error(`   ❌ Error sweeping campaign #${campaign.id}:`, err.message);
        }
    }

    console.log('\n✨ Global sweep complete. All dust recovered!');
    process.exit(0);
}

sweepFunds();
