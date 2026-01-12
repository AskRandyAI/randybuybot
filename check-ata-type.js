const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function check() {
    const mint = new PublicKey('ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump');
    const owner = new PublicKey('61szLAnUdZ1dVyv8rWYSosjA2AayPRa4GxVcnAcGhaGw');

    const standard = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const t2022 = await getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    console.log('Target ATA from logs: CCatHQ4LJJyaiX4WfkyteQcGpZH99XhECLB7F3qcNuUf');
    console.log('Standard ATA:', standard.toString());
    console.log('T2022 ATA:', t2022.toString());

    if (standard.toString() === 'CCatHQ4LJJyaiX4WfkyteQcGpZH99XhECLB7F3qcNuUf') {
        console.log('🚨 BINGO! The record in the logs IS a Standard ATA derivation!');
    }
}

check();
