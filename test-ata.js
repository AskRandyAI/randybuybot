const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function testDerivation() {
    const mint = new PublicKey('ACXK4KmfXrf93e3AEo1ZiGDDDpcBpNEnWVxy9BHFpump');
    const owner = new PublicKey('E3tPZ3cZHaKumG2dnmJs6jJ86h6UjkjSMD2okVXbF1ZH');

    console.log(`Mint: ${mint.toString()}`);
    console.log(`Owner: ${owner.toString()}`);

    const t2022Ata_false = await getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    console.log(`\nT2022 ATA (false): ${t2022Ata_false.toString()}`);

    const t2022Ata_true = await getAssociatedTokenAddress(mint, owner, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    console.log(`T2022 ATA (true): ${t2022Ata_true.toString()}`);
}

testDerivation();
