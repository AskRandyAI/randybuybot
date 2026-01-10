const fetch = require('node-fetch');

async function test() {
    console.log('Testing connection to Jupiter API...\n');
    
    try {
        const response = await fetch('https://quote-api.jup.ag/v6/tokens');
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Jupiter API is reachable from Node.js!\n');
        
        const data = await response.json();
        console.log('Received', Object.keys(data).length, 'tokens');
    } catch (error) {
        console.log('❌ FAILED!');
        console.log('Error:', error.message);
        console.log('\nJupiter API is still blocked.\n');
    }
}

test();