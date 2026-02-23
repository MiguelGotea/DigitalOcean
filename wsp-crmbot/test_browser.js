const puppeteer = require('puppeteer');

(async () => {
    console.log('🚀 Lanzando navegador de prueba...');
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        console.log('🌐 Navegando a web.whatsapp.com...');
        await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 60000 });
        const title = await page.title();
        console.log(`✅ Título de la página: ${title}`);
        await browser.close();
        console.log('👋 Prueba completada con éxito.');
        process.exit(0);
    } catch (err) {
        console.error(`❌ Error en la prueba: ${err.message}`);
        process.exit(1);
    }
})();
