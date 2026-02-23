const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

console.log('🚀 Starting minimal WPP test...');

const client = new Client({
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable',
        dumpio: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ]
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
