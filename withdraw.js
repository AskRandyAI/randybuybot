require('dotenv').config();
const { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getDepositKeypair } = require('./blockchain/wallet');
const readline = require('readline');

// CONFIG
const RESERVE_SOL = 0.002; // Keep 0.002 SOL for fees/rent to avoid transaction failure

async function withdrawFunds() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const destinationAddress = process.argv[2];

    if (!destinationAddress) {
        console.log('❌ Usage: node withdraw.js <DESTINATION_WALLET_ADDRESS>');
        process.exit(1);
    }

    try {
        // Validation
        let destPubkey;
        try {
            destPubkey = new PublicKey(destinationAddress);
        } catch (e) {
            console.error('❌ Invalid destination address format.');
            process.exit(1);
        }

        // Setup
        const rpcUrl = process.env.SOLANA_RPC_URL;
        const connection = new Connection(rpcUrl, 'confirmed');
        const depositKeypair = getDepositKeypair();

        console.log(`\n🤖 Bot Wallet: ${depositKeypair.publicKey.toString()}`);
        console.log(`🏦 Destination: ${destPubkey.toString()}`);

        // Check Balance
        const balance = await connection.getBalance(depositKeypair.publicKey);
        const balanceSol = balance / 1_000_000_000;

        console.log(`💰 Current Balance: ${balanceSol} SOL`);

        if (balanceSol <= RESERVE_SOL) {
            console.error(`❌ Insufficient funds. Balance (${balanceSol}) is less than reserve (${RESERVE_SOL}).`);
            process.exit(1);
        }

        const withdrawAmountSol = balanceSol - RESERVE_SOL;
        const withdrawAmountLamports = Math.floor(withdrawAmountSol * 1_000_000_000);

        console.log(`\n💸 Ready to withdraw ~${withdrawAmountSol.toFixed(4)} SOL`);
        console.log(`   (Reserved ${RESERVE_SOL} SOL for fees)`);

        rl.question('\n⚠️  Type "confirmation" to proceed: ', async (answer) => {
            if (answer !== 'confirmation') {
                console.log('❌ Cancelled.');
                process.exit(0);
            }

            console.log('\n🚀 Sending transaction...');

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: depositKeypair.publicKey,
                    toPubkey: destPubkey,
                    lamports: withdrawAmountLamports,
                })
            );

            try {
                const signature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [depositKeypair]
                );
                console.log(`\n✅ Success! Transaction Signature:`);
                console.log(`https://solscan.io/tx/${signature}`);
            } catch (err) {
                console.error('❌ Transaction failed:', err);
            }

            rl.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

withdrawFunds();
