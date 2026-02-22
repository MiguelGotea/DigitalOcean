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

    clienteWA = new Client({
        authStrategy: new LocalAuth({
            dataPath: '.wwebjs_auth'
        }),
        // Cargar siempre la versión más reciente de WhatsApp Web
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015901134-alpha.html'
        },
        puppeteer: {
            headless: true,
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-accelerated-video-decode',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--safebrowsing-disable-auto-update',
                '--ignore-certificate-errors',
                '--ignore-ssl-errors',
                '--ignore-certificate-errors-spki-list'
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
        console.log('✅ WhatsApp Web conectado y listo');
        estadoActual = 'conectado';
        qrBase64 = null;
        await reportarEstadoVPS('conectado', null);
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

    await clienteWA.initialize();
}

/**
 * Notifica a la API el estado actual del VPS/WhatsApp
 */
async function reportarEstadoVPS(estado, qr) {
    try {
        const axios = require('axios');
        const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
        await axios.post(`${API_BASE_URL}/api/wsp/registrar_sesion.php`, {
            estado,
            qr_base64: qr || null
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

function obtenerQR() { return qrBase64; }
function obtenerCliente() { return clienteWA; }

module.exports = { iniciarWhatsApp, obtenerEstado, obtenerQR, obtenerCliente };
