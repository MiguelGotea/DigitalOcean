const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

console.log('🚀 Starting minimal WPP test...');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'debug_test' }),
    puppeteer: {
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('📷 QR received!');
});

client.on('loading_screen', (perc, msg) => {
    console.log(`⏳ Loading: ${perc}% - ${msg}`);
});

console.log('🏁 Calling initialize()...');
client.initialize().then(() => {
    console.log('✅ Initialized!');
}).catch(err => {
    console.error('❌ Error:', err);
});
