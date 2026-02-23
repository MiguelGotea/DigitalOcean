const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

console.log('🚀 Starting minimal WPP test...');

const client = new Client({
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018911162-alpha.html'
    },
    puppeteer: {
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        dumpio: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions'
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
