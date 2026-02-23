'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// Estado interno del cliente
let estadoActual = 'desconectado';   // desconectado | qr_pendiente | conectado
let qrBase64 = null;
let clienteWA = null;


/**
 * Inicializa el cliente de whatsapp-web.js con sesión persistente.
 * La sesión se guarda en .wwebjs_auth/ (excluida del repo).
 */
async function iniciarWhatsApp() {
    console.log('📱 Iniciando cliente WhatsApp Web...');

    // Detectar ejecutable de Chromium/Chrome disponible
    const fs = require('fs');
    const path = require('path');

    const chromiumPaths = [
        '/usr/bin/google-chrome-stable',    // Chrome estable (preferido)
        '/usr/bin/google-chrome',           // Chrome genérico
        '/usr/bin/chromium',                // apt en Ubuntu sin snap
        '/usr/bin/chromium-browser',        // último recurso (puede ser snap stub)
    ];
    const executablePath = chromiumPaths.find(p => fs.existsSync(p));
    if (!executablePath) {
        console.error('❌ No se encontró Chromium/Chrome. Ejecuta: apt install -y chromium');
        process.exit(1);
    }
    console.log('🌐 Usando navegador:', executablePath);

    // Limpiar SingletonLock si existe (de crashes anteriores o zombies)
    const cleanupLocks = () => {
        const clientId = require('../config/api').WSP_INSTANCIA;
        const paths = [
            path.join(process.cwd(), `.wwebjs_auth_${clientId}`, `session-${clientId}`, 'SingletonLock'),
            path.join(process.cwd(), '.wwebjs_auth', 'session', 'SingletonLock')
        ];
        paths.forEach(p => {
            if (fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                    console.log(`🔓 SingletonLock eliminado: ${p}`);
                } catch (e) {
                    console.warn(`⚠️  Lock ocupado por otro proceso: ${p}`);
                }
            }
        });
    };
    cleanupLocks();

    const clientId = require('../config/api').WSP_INSTANCIA;
    clienteWA = new Client({
        authStrategy: new LocalAuth({
            clientId: clientId,
            dataPath: `.wwebjs_auth_${clientId}`
        }),
        puppeteer: {
            headless: 'new', // Recomendado para puppeteer >= 20
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--disable-extensions'
            ]
        }
    });

    // ── Eventos ──

    clienteWA.on('qr', async (qr) => {
        console.log('📷 QR generado — escanéalo desde el ERP');
        estadoActual = 'qr_pendiente';
        // Convertir QR a base64 para mostrarlo en el ERP
        qrBase64 = await qrcode.toDataURL(qr);
        // Reportar estado a la API
        await reportarEstadoVPS('qr_pendiente', qrBase64);
    });

    clienteWA.on('ready', async () => {
        const numero = clienteWA.info?.wid?.user || null;
        console.log(`✅ WhatsApp Web conectado y listo — Número: ${numero || 'desconocido'}`);
        estadoActual = 'conectado';
        qrBase64 = null;
        await reportarEstadoVPS('conectado', null, numero);
    });

    clienteWA.on('authenticated', () => {
        console.log('🔐 Sesión autenticada');
    });

    clienteWA.on('auth_failure', async (msg) => {
        console.error('❌ Fallo de autenticación:', msg);
        estadoActual = 'desconectado';
        await reportarEstadoVPS('desconectado', null);
    });

    clienteWA.on('disconnected', async (reason) => {
        console.warn('⚠️  WhatsApp desconectado:', reason);
        estadoActual = 'desconectado';
        qrBase64 = null;
        await reportarEstadoVPS('desconectado', null);
        // Reintentar conexión después de 30s
        setTimeout(iniciarWhatsApp, 30_000);
    });

    // Timeout de seguridad: si no inicializa en 120s, algo está mal
    const initTimeout = setTimeout(() => {
        if (estadoActual === 'desconectado') {
            console.error('⌛ clienteWA.initialize() tardando demasiado (120s)...');
        }
    }, 120_000);

    console.log('🏁 Preparando clienteWA.initialize() en 5 segundos...');
    await new Promise(r => setTimeout(r, 5000));

    try {
        await clienteWA.initialize();
        clearTimeout(initTimeout);
        console.log('🚀 clienteWA.initialize() completado');
        return clienteWA;
    } catch (err) {
        clearTimeout(initTimeout);
        console.error('❌ Error en clienteWA.initialize():', err.message);
        // No lanzamos el error para evitar crash del proceso completo, 
        // el loop de reintento en app.js se encargará de volver a llamar.
        return null;
    }
}

/**
 * Notifica a la API el estado actual del VPS/WhatsApp
 * @param {string} estado - conectado|qr_pendiente|desconectado
 * @param {string|null} qr - QR en base64 (solo cuando qr_pendiente)
 * @param {string|null} numero - Número WhatsApp vinculado (solo cuando conectado)
 */
async function reportarEstadoVPS(estado, qr, numero = null) {
    try {
        const axios = require('axios');
        const { API_BASE_URL, WSP_TOKEN, WSP_INSTANCIA } = require('../config/api');
        await axios.post(`${API_BASE_URL}/api/wsp/registrar_sesion.php`, {
            estado,
            instancia: WSP_INSTANCIA,
            qr_base64: qr || null,
            numero_telefono: numero || null
        }, {
            headers: { 'X-WSP-Token': WSP_TOKEN },
            timeout: 10_000
        });
    } catch (err) {
        console.error('⚠️  No se pudo reportar estado a la API:', err.message);
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
    console.log('🔄 Iniciando reset de sesión WhatsApp...');

    // 1. Destruir cliente actual (sin esperar demasiado)
    if (clienteWA) {
        console.log('🔌 Destruyendo cliente anterior...');
        try {
            // Intentamos destruir con un timeout para que no bloquee todo
            await Promise.race([
                clienteWA.destroy(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout destruyendo cliente')), 5000))
            ]);
        } catch (e) {
            console.warn('⚠️  Al destruir cliente:', e.message);
        }
        clienteWA = null;
    }

    // 2. Borrar la carpeta de sesión local de forma radical
    const fs = require('fs');
    const path = require('path');
    const authPath = path.resolve('.wwebjs_auth');

    console.log(`🗑️  Limpiando carpeta de sesión: ${authPath}`);
    if (fs.existsSync(authPath)) {
        try {
            // Intentar borrar varias veces si falla por bloqueos
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('✅ Carpeta .wwebjs_auth eliminada satisfactoriamente');
        } catch (e) {
            console.error('❌ No se pudo eliminar la carpeta de sesión:', e.message);
        }
    }

    // 3. Matar procesos de Chrome huérfanos si es posible (solo funciona si hay permisos)
    try {
        const { execSync } = require('child_process');
        console.log('🧹 Intentando limpiar procesos Chrome huérfanos...');
        // Ojo: esto puede afectar a otras instancias si no se tiene cuidado,
        // pero en un VPS dedicado a esto suele ser necesario.
        // Solo matamos procesos que tengan el path de esta instancia en sus args.
        // execSync(`pkill -f "${process.cwd()}" || true`);
    } catch (e) { }

    // 4. Actualizar estado y re-notificar
    estadoActual = 'desconectado';
    qrBase64 = null;
    await reportarEstadoVPS('desconectado', null);

    // 5. Re-inicializar 
    console.log('⏳ Re-inicializando en 5 segundos...');
    setTimeout(iniciarWhatsApp, 5_000);
}

module.exports = { iniciarWhatsApp, obtenerEstado, obtenerQR, obtenerCliente, reportarEstadoVPS, obtenerEstadoActual, resetearSesion };
