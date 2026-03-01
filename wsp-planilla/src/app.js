'use strict';

require('dotenv').config();
const express = require('express');
const { iniciarWhatsApp, obtenerEstado, obtenerQR, reportarEstadoVPS, obtenerEstadoActual, obtenerCliente, resetearSesion } = require('./whatsapp/client');
const { iniciarWorkerPlanilla } = require('./workers/planilla_worker');
const { WSP_INSTANCIA } = require('./config/api');

const logApp = (msg) => {
    const pid = process.pid;
    const ut = Math.round(process.uptime());
    console.log(`[APP|PID:${pid}|UT:${ut}s] ${msg}`);
};

// ── Manejo de errores globales ──
process.on('uncaughtException', (err) => {
    logApp(`💥 FATAL UNCAUGHT EXCEPTION: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logApp(`💥 UNHANDLED REJECTION: ${reason}`);
});

const app = express();
const PORT = process.env.PORT || 3005;

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
        servicio: `pitaya-wsp-planilla (${WSP_INSTANCIA})`,
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

// ── Reset de sesión (cambiar número) ──
app.post('/reset', validarToken, async (req, res) => {
    try {
        await resetearSesion();
        res.json({ success: true, mensaje: 'Sesion reiniciada, generando QR...' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Arranque ──
async function arrancar() {
    logApp(`🚀 Iniciando Pitaya WSP Planilla [${WSP_INSTANCIA}]...`);

    // 1. Levantar Express inmediatamente
    await new Promise((resolve) => {
        app.listen(PORT, '0.0.0.0', () => {
            logApp(`✅ API interna [${WSP_INSTANCIA}] escuchando en http://0.0.0.0:${PORT}`);
            resolve();
        });
    });

    logApp('⏳ Esperando 15s antes de arrancar WhatsApp...');
    await new Promise(r => setTimeout(r, 15_000));

    // 2. Iniciar WhatsApp en background
    iniciarWhatsApp()
        .then((clienteWA) => {
            if (!clienteWA) return;
            iniciarWorkerPlanilla();
            logApp('📋 Modo Planilla activo — notificaciones a colaboradores');
        })
        .catch(err => {
            logApp(`❌ Error fatal en flujo de WhatsApp: ${err.message}`);
        });

    // 3. Heartbeat: actualiza ultimo_ping cada 60s
    setInterval(async () => {
        try {
            const estado = obtenerEstadoActual();
            let realWaState = 'N/A';

            // Intento de "despertar" WhatsApp y verificar que el engine no está congelado
            if (estado === 'conectado') {
                const cliente = obtenerCliente();
                if (cliente) {
                    try {
                        // Promise.race para evitar quedarnos colgados si la pestaña murió
                        realWaState = await Promise.race([
                            cliente.getState(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_GET_STATE')), 10000))
                        ]);
                        if (realWaState === 'TIMEOUT' || realWaState === 'UNPAIRED') {
                            logApp(`⚠️  El estado real de WA reportó ${realWaState} — forzando reset_solicitado falso pero es preocupante`);
                        }

                        // Forzar "en línea" para mantener viva la conexión WebSocket de WhatsApp Web
                        try {
                            await cliente.sendPresenceAvailable();
                        } catch (presenceErr) {
                            // Ignorar si falla el presence
                        }

                    } catch (e) {
                        realWaState = `ERROR: ${e.message}`;
                        logApp(`🚨 WhatsApp congelado / Inaccesible -> ${e.message}. Forzando reset...`);
                        await resetearSesion();
                        return; // Salir de esta iteración
                    }
                }
            }

            const data = await reportarEstadoVPS(estado, null);
            logApp(`💓 Heartbeat [${WSP_INSTANCIA}] — estado: ${estado} | engine: ${realWaState}`);

            if (data && data.reset_solicitado) {
                logApp('🔄 Detectada solicitud de reset en heartbeat — ejecutando...');
                await resetearSesion();
            }
        } catch (e) {
            logApp(`⚠️  Heartbeat falló: ${e.message}`);
        }
    }, 60_000);
}

arrancar().catch(err => {
    console.error('❌ Error arrancando el servicio:', err);
    process.exit(1);
});
