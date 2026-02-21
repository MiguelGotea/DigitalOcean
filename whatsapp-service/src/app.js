'use strict';

require('dotenv').config();
const express = require('express');
const { iniciarWhatsApp, obtenerEstado, obtenerQR } = require('./whatsapp/client');
const { iniciarWorker } = require('./workers/campaign_worker');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ── Seguridad básica: solo aceptar del localhost o de la misma red ──
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    // Permitir localhost siempre; en producción agregar IP de la API si se necesita
    const permitidas = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (!permitidas.includes(ip)) {
        return res.status(403).json({ error: 'Acceso no permitido', ip });
    }
    next();
});

// ── Rutas internas ──
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        servicio: 'pitaya-whatsapp-service',
        hora: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json(obtenerEstado());
});

app.get('/qr', (req, res) => {
    const qr = obtenerQR();
    if (!qr) return res.json({ qr: null, mensaje: 'Sin QR disponible o ya conectado' });
    res.json({ qr });   // base64 de la imagen QR
});

// ── Arranque ──
async function arrancar() {
    console.log('🚀 Iniciando Pitaya WhatsApp Service...');

    await iniciarWhatsApp();   // Conecta WhatsApp
    iniciarWorker();           // Inicia el cron de campañas

    app.listen(PORT, '127.0.0.1', () => {
        console.log(`✅ API interna escuchando en http://127.0.0.1:${PORT}`);
    });
}

arrancar().catch(err => {
    console.error('❌ Error arrancando el servicio:', err);
    process.exit(1);
});
