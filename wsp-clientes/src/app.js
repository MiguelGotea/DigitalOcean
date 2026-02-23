'use strict';

require('dotenv').config();
const express = require('express');
const { iniciarWhatsApp, obtenerEstado, obtenerQR, reportarEstadoVPS, obtenerEstadoActual, obtenerCliente, resetearSesion } = require('./whatsapp/client');
const { iniciarWorker } = require('./workers/campaign_worker');
const { iniciarCRMBot } = require('./workers/crm_bot_worker');
const { WSP_INSTANCIA } = require('./config/api');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ── Seguridad: token requerido para rutas sensibles ──
const WSP_TOKEN = process.env.WSP_TOKEN || '';
function validarToken(req, res, next) {
    const token = req.headers['x-wsp-token'] || req.query.token;
    if (WSP_TOKEN && token !== WSP_TOKEN) {
        return res.status(403).json({ error: 'Token invalido' });
    }
    next();
}

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
app.post('/send', validarToken, async (req, res) => {
    // Acepta {to, message} o {numero, texto}
    const numero = req.body.to || req.body.numero;
    const texto = req.body.message || req.body.texto;
    if (!numero || !texto) return res.status(400).json({ error: 'numero/to y texto/message son requeridos' });
    try {
        const cliente = obtenerCliente();
        if (!cliente) return res.status(503).json({ success: false, error: 'WhatsApp no conectado' });
        const chatId = numero.includes('@c.us') ? numero : `${numero}@c.us`;
        await cliente.sendMessage(chatId, texto);
        res.json({ success: true, numero, chatId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Reset de sesion (cambiar número) ──
app.post('/reset', validarToken, async (req, res) => {
    try {
        await resetearSesion();
        res.json({ success: true, mensaje: 'Sesion reiniciada, generando QR...' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Arranque: Express PRIMERO, luego WhatsApp en background ──
async function arrancar() {
    console.log(`🚀 Iniciando Pitaya WhatsApp Service [${WSP_INSTANCIA}]...`);

    // 1. Levantar Express inmediatamente (así el puerto siempre está disponible)
    await new Promise((resolve) => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ API interna [${WSP_INSTANCIA}] escuchando en http://0.0.0.0:${PORT}`);
            resolve();
        });
    });

    // 2. Iniciar WhatsApp en background (no bloquea el servidor Express)
    iniciarWhatsApp()
        .then((clienteWA) => {
            if (!clienteWA) return; // Ya se encargará el retry interno de client.js

            // Activar workers según instancia
            if (WSP_INSTANCIA === 'wsp-crmbot') {
                iniciarCRMBot(clienteWA);
                console.log('🤖 Modo CRM Bot activo');
            } else {
                iniciarWorker();
                console.log('📣 Modo Campañas activo');
            }
        })
        .catch(err => {
            console.error('❌ Error fatal en flujo de WhatsApp:', err.message);
        });

    // 3. Heartbeat: actualiza ultimo_ping cada 60s
    setInterval(async () => {
        try {
            const estado = obtenerEstadoActual();
            await reportarEstadoVPS(estado, null);
            console.log(`💓 Heartbeat [${WSP_INSTANCIA}] — estado: ${estado}`);
        } catch (e) {
            console.warn('⚠️  Heartbeat falló:', e.message);
        }
    }, 60_000);
}

arrancar().catch(err => {
    console.error('❌ Error arrancando el servicio:', err);
    process.exit(1);
});
