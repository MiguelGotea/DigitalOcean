'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// Estado interno del cliente
let estadoActual = 'desconectado';
let estaIniciando = false;
let qrBase64 = null;
let clienteWA = null;
let sessionIntentId = 0; // Para cancelar inits obsoletos durante el delay de stagger

const logMsg = (msg) => {
    const pid = process.pid;
    const ut = Math.round(process.uptime());
    console.log(`[PID:${pid}|UT:${ut}s] ${msg}`);
};


/**
 * Inicializa el cliente de whatsapp-web.js con sesión persistente.
 * La sesión se guarda en .wwebjs_auth/ (excluida del repo).
 */
async function iniciarWhatsApp() {
    const currentInitId = ++sessionIntentId;

    if (estaIniciando) {
        logMsg(`⚠️  Ya hay una inicialización en curso... (Intento ID:${currentInitId})`);
        return;
    }
    if (estadoActual === 'conectado' && clienteWA) {
        logMsg('✅ WhatsApp ya está conectado.');
        return;
    }

    logMsg(`📱 [ID:${currentInitId}] Iniciando cliente WhatsApp Web...`);
    estaIniciando = true;
    estadoActual = 'inicializando';
    await reportarEstadoVPS('inicializando', null);

    // Detectar ejecutable de Chromium/Chrome disponible
    const fs = require('fs');
    const path = require('path');

    const chromiumPaths = [
        '/usr/bin/google-chrome-stable',    // Chrome estable (preferido)
        '/usr/bin/google-chrome',           // Chrome genérico
        '/usr/bin/chromium',                // apt en Ubuntu sin snap
    ];
    const executablePath = chromiumPaths.find(p => fs.existsSync(p));
    if (!executablePath) {
        logMsg('❌ No se encontró Chromium/Chrome en el sistema.');
        estaIniciando = false;
        return;
    }
    logMsg(`🌐 Usando navegador: ${executablePath}`);

    // Limpiar SingletonLock si existe
    const cleanupLocks = () => {
        const { WSP_INSTANCIA } = require('../config/api');
        const paths = [
            path.join(process.cwd(), `.wwebjs_auth_${WSP_INSTANCIA}`, `session-${WSP_INSTANCIA}`, 'SingletonLock'),
            path.join(process.cwd(), '.wwebjs_auth', 'session', 'SingletonLock')
        ];
        paths.forEach(p => {
            if (fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                    logMsg(`🔓 SingletonLock eliminado: ${p}`);
                } catch (e) {
                    logMsg(`⚠️  Lock ocupado: ${p}`);
                }
            }
        });
    };
    cleanupLocks();

    const { WSP_INSTANCIA } = require('../config/api');
    clienteWA = new Client({
        authStrategy: new LocalAuth({
            clientId: WSP_INSTANCIA,
            dataPath: `.wwebjs_auth_${WSP_INSTANCIA}`
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018911162-alpha.html'
        },
        puppeteer: {
            headless: true, // Clasico headless (a veces mas estable en VPS)
            executablePath,
            dumpio: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--no-first-run',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-update',
                '--disable-domain-reliability',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-features=IsolateOrigins,site-per-process,AudioServiceOutOfProcess'
            ]
        }
    });

    // ── Eventos ──

    clienteWA.on('qr', async (qr) => {
        logMsg('📷 QR generado — escanéalo desde el ERP');
        estadoActual = 'qr_pendiente';
        qrBase64 = await qrcode.toDataURL(qr);
        await reportarEstadoVPS('qr_pendiente', qrBase64);
    });

    clienteWA.on('ready', async () => {
        const numero = clienteWA.info?.wid?.user || null;
        logMsg(`✅ WhatsApp Web conectado y listo — Número: ${numero || 'desconocido'}`);
        estadoActual = 'conectado';
        estaIniciando = false;
        qrBase64 = null;
        await reportarEstadoVPS('conectado', null, numero);
    });

    clienteWA.on('auth_failure', async (msg) => {
        logMsg(`❌ Fallo de autenticación: ${msg}`);
        estadoActual = 'desconectado';
        estaIniciando = false;
        await reportarEstadoVPS('desconectado', null);
    });

    clienteWA.on('disconnected', async (reason) => {
        logMsg(`⚠️  WhatsApp desconectado: ${reason}`);
        estadoActual = 'desconectado';
        estaIniciando = false;
        qrBase64 = null;
        await reportarEstadoVPS('desconectado', null);

        // Reintentar conexión después de un delay
        setTimeout(iniciarWhatsApp, 15_000);
    });

    // Timeout de seguridad: si no inicializa en 300s, algo está mal
    const initTimeout = setTimeout(() => {
        if (estaIniciando && estadoActual === 'desconectado') {
            logMsg('⌛ clienteWA.initialize() tardando demasiado (300s)...');
        }
    }, 300_000);

    const staggerDelay = WSP_INSTANCIA === 'wsp-crmbot' ? 45_000 : 15_000;
    logMsg(`🏁 [ID:${currentInitId}] Preparando clienteWA.initialize() en ${staggerDelay / 1000} segundos para evitar saturar RAM...`);
    await new Promise(r => setTimeout(r, staggerDelay));

    // VERIFICAR QUE NO HAYA HABIDO UN RESET EN EL INTERIN
    if (currentInitId !== sessionIntentId) {
        logMsg(`🛑 [ID:${currentInitId}] Inicialización cancelada (detectado reset o nuevo intento).`);
        estaIniciando = false;
        return null;
    }

    logMsg(`🚀 [ID:${currentInitId}] Ejecutando clienteWA.initialize()...`);

    try {
        await clienteWA.initialize();
        clearTimeout(initTimeout);
        estaIniciando = false;
        logMsg(`✅ [ID:${currentInitId}] clienteWA.initialize() completado`);
        return clienteWA;
    } catch (err) {
        clearTimeout(initTimeout);
        estaIniciando = false;
        logMsg(`❌ [ID:${currentInitId}] Error en clienteWA.initialize(): ${err.message}`);

        // Programar reintento solo si falló la inicialización inicial y no hay reset pendiente
        if (currentInitId === sessionIntentId) {
            setTimeout(iniciarWhatsApp, 30_000);
        }
        return null;
    }
}

/**
 * Notifica a la API el estado actual del VPS/WhatsApp
 * @param {string} estado - conectado|qr_pendiente|desconectado|inicializando
 * @param {string|null} qr - QR en base64 (solo cuando qr_pendiente)
 * @param {string|null} numero - Número WhatsApp vinculado (solo cuando conectado)
 */
async function reportarEstadoVPS(estado, qr, numero = null) {
    try {
        const axios = require('axios');
        const { API_BASE_URL, WSP_TOKEN, WSP_INSTANCIA } = require('../config/api');
        const resp = await axios.post(`${API_BASE_URL}/api/wsp/registrar_sesion.php`, {
            estado,
            instancia: WSP_INSTANCIA,
            qr_base64: qr || null,
            numero_telefono: numero || null
        }, {
            headers: { 'X-WSP-Token': WSP_TOKEN },
            timeout: 10_000
        });
        return resp.data;
    } catch (err) {
        logMsg(`⚠️  No se pudo reportar estado a la API: ${err.message}`);
        return null;
    }
}

// ── Getters para el servidor Express interno ──
function obtenerEstado() {
    return {
        estado: estadoActual,
        qr: qrBase64 ? 'disponible' : null,
        timestamp: new Date().toISOString()
    };
}

function obtenerEstadoActual() { return estadoActual; }
function obtenerQR() { return qrBase64; }
function obtenerCliente() { return clienteWA; }

/**
 * Reinicia completamente la sesión WhatsApp (para cambio de número)
 * Destruye el cliente actual, borra .wwebjs_auth y re-inicializa (genera nuevo QR)
 */
async function resetearSesion() {
    sessionIntentId++; // Invalidar cualquier inicialización en cola
    logMsg(`🔄 [ID:${sessionIntentId}] Iniciando reset de sesión WhatsApp...`);

    // 1. Destruir cliente actual (sin esperar demasiado)
    if (clienteWA) {
        logMsg('🔌 Destruyendo cliente anterior...');
        try {
            await Promise.race([
                clienteWA.destroy(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout destruyendo cliente')), 5000))
            ]);
        } catch (e) {
            logMsg(`⚠️  Al destruir cliente: ${e.message}`);
        }
        clienteWA = null;
    }

    // 2. Borrar la carpeta de sesión local de forma radical
    const fs = require('fs');
    const path = require('path');
    const { WSP_INSTANCIA } = require('../config/api');
    const authPath = path.resolve(`.wwebjs_auth_${WSP_INSTANCIA}`);

    logMsg(`🗑️  Limpiando carpeta de sesión: ${authPath}`);
    if (fs.existsSync(authPath)) {
        try {
            fs.rmSync(authPath, { recursive: true, force: true });
            logMsg(`✅ Carpeta ${authPath} eliminada satisfactoriamente`);
        } catch (e) {
            logMsg(`❌ No se pudo eliminar la carpeta de sesión: ${e.message}`);
        }
    }

    // 3. Matar procesos de Chrome huérfanos residuo de esta instancia
    try {
        const { execSync } = require('child_process');
        logMsg(`🧹 Limpiando procesos Chrome de ${WSP_INSTANCIA}...`);
        execSync(`pkill -9 -f ".wwebjs_auth_${WSP_INSTANCIA}" || true`);
    } catch (e) { }

    // 4. Actualizar estado y re-notificar
    estadoActual = 'desconectado';
    qrBase64 = null;
    estaIniciando = false;
    await reportarEstadoVPS('desconectado', null);

    // 5. Re-inicializar 
    logMsg('⏳ Re-inicializando en 5 segundos...');
    setTimeout(iniciarWhatsApp, 5_000);
}

module.exports = { iniciarWhatsApp, obtenerEstado, obtenerQR, obtenerCliente, reportarEstadoVPS, obtenerEstadoActual, resetearSesion };
