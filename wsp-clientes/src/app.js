'use strict';

require('dotenv').config();
const express = require('express');
const { iniciarWhatsApp, obtenerEstado, obtenerQR, reportarEstadoVPS, obtenerEstadoActual, obtenerCliente } = require('./whatsapp/client');
const { iniciarWorker } = require('./workers/campaign_worker');
const { iniciarCRMBot } = require('./workers/crm_bot_worker');
const { WSP_INSTANCIA } = require('./config/api');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ── Seguridad básica: solo aceptar del localhost ──
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
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
        servicio: `pitaya-whatsapp-service (${WSP_INSTANCIA})`,
        hora: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json(obtenerEstado());
});

app.get('/qr', (req, res) => {
    const qr = obtenerQR();
    if (!qr) return res.json({ qr: null, mensaje: 'Sin QR disponible o ya conectado' });
    res.json({ qr });
});

// ── Envío manual (CRM humano → cliente) ──
app.post('/send', async (req, res) => {
    const { numero, texto } = req.body;
    if (!numero || !texto) return res.status(400).json({ error: 'numero y texto son requeridos' });
    try {
        const cliente = obtenerCliente();
        if (!cliente) return res.status(503).json({ error: 'WhatsApp no conectado' });
        const chatId = numero.includes('@c.us') ? numero : `${numero}@c.us`;
        await cliente.sendMessage(chatId, texto);
        res.json({ ok: true, numero, chatId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Arranque ──
async function arrancar() {
    console.log(`🚀 Iniciando Pitaya WhatsApp Service [${WSP_INSTANCIA}]...`);

    const clienteWA = await iniciarWhatsApp();

    // Activar workers según instancia
    if (WSP_INSTANCIA === 'wsp-crmbot') {
        iniciarCRMBot(clienteWA);
        console.log('🤖 Modo CRM Bot activo');
    } else {
        iniciarWorker();
        console.log('📣 Modo Campañas activo');
    }

    // ── Heartbeat: actualiza ultimo_ping en la API cada 60s ──
    setInterval(async () => {
        try {
            const estado = obtenerEstadoActual();
            await reportarEstadoVPS(estado, null);
            console.log(`💓 Heartbeat [${WSP_INSTANCIA}] — estado: ${estado}`);
        } catch (e) {
            console.warn('⚠️  Heartbeat falló:', e.message);
        }
    }, 60_000);

    app.listen(PORT, '127.0.0.1', () => {
        console.log(`✅ API interna [${WSP_INSTANCIA}] escuchando en http://127.0.0.1:${PORT}`);
    });
}

arrancar().catch(err => {
    console.error('❌ Error arrancando el servicio:', err);
    process.exit(1);
});
