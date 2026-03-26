'use strict';

/**
 * correosHandler.js — Router de intents del módulo de correos
 *
 * Intents: enviar_correo, buscar_correo, correos_pendientes
 *
 * Flujo enviar_correo:
 *  1. Detecta si el mensaje tiene media adjunta (foto/doc de WhatsApp)
 *  2. POST /api/bot/correos/enviar.php con destinatario, asunto, cuerpo y adjunto opcional
 *
 * Flujo buscar_correo:
 *  1. POST /api/bot/correos/buscar.php con remitente y/o palabras_clave
 *  2. Formatea hasta 5 resultados
 *
 * Flujo correos_pendientes:
 *  1. POST /api/bot/correos/pendientes.php
 *  2. Lista hasta 10 correos no leídos (últimos 7 días)
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../../config/api');
const { log, logError } = require('../../utils/logger');

const MODULO  = 'CORREOS_HANDLER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN, 'Content-Type': 'application/json' };
const TIMEOUT = 20_000;

// ─────────────────────────────────────────────
//  Ejecutor principal
// ─────────────────────────────────────────────

async function ejecutar(intent, entidades, operario, _ctx, msgOriginal = null) {
    log(MODULO, `▶ Ejecutando intent: ${intent}`);

    try {
        if (intent === 'enviar_correo') {
            return await enviarCorreo(entidades, operario, msgOriginal);
        }
        if (intent === 'buscar_correo') {
            return await buscarCorreo(entidades, operario);
        }
        if (intent === 'correos_pendientes') {
            return await correosPendientes(operario);
        }

        return { respuesta: `⚠️ Intent de correos no reconocido: ${intent}`, subflow: null };

    } catch (err) {
        logError(MODULO, `Error ejecutando ${intent}`, err);
        return { respuesta: `⚠️ Error procesando tu solicitud de correo. Intenta de nuevo.`, subflow: null };
    }
}

// ─────────────────────────────────────────────
//  Funciones por intent
// ─────────────────────────────────────────────

async function enviarCorreo(entidades, operario, msgOriginal) {
    const destinatarioNombre = entidades?.destinatario || entidades?.participantes?.[0] || null;
    const asunto             = entidades?.titulo || '(sin asunto)';
    const cuerpo             = entidades?.contenido || entidades?.descripcion || '';

    if (!destinatarioNombre) {
        return { respuesta: `❌ No entendí a quién enviar el correo. Indica el nombre del destinatario.`, subflow: null };
    }
    if (!cuerpo) {
        return { respuesta: `❌ No entendí el contenido del correo. Indícalo con claridad.`, subflow: null };
    }

    const payload = {
        cod_operario:       operario.CodOperario,
        destinatario_nombre: destinatarioNombre,
        asunto,
        cuerpo
    };

    // Detectar adjunto de WhatsApp
    if (msgOriginal?.hasMedia) {
        try {
            const media       = await msgOriginal.downloadMedia();
            payload.adjunto   = {
                datos:    media.data,
                mimetype: media.mimetype,
                filename: media.filename || 'adjunto'
            };
            log(MODULO, `📎 Adjunto detectado: ${media.filename || 'adjunto'} (${media.mimetype})`);
        } catch (e) {
            logError(MODULO, 'No se pudo descargar el adjunto', e);
        }
    }

    const resp = await axios.post(
        `${API_BASE_URL}/api/bot/correos/enviar.php`,
        payload,
        { headers: HEADERS, timeout: TIMEOUT }
    );

    if (!resp.data?.success) {
        return { respuesta: `❌ ${resp.data?.message || 'No se pudo enviar el correo.'}`, subflow: null };
    }

    const d = resp.data;
    return {
        respuesta: `📧 *Correo enviado*\nPara: ${d.para} (${d.email_enviado})\nAsunto: _${d.asunto}_${d.con_adjunto ? '\n📎 Con adjunto' : ''}\n✅ Enviado correctamente`,
        subflow: null
    };
}

async function buscarCorreo(entidades, operario) {
    const remitente    = entidades?.remitente || entidades?.destinatario || null;
    const palabrasClave = entidades?.palabras_clave || [];

    if (!remitente && palabrasClave.length === 0) {
        return { respuesta: `❌ Indica de quién buscar el correo o palabras clave del asunto.`, subflow: null };
    }

    const resp = await axios.post(
        `${API_BASE_URL}/api/bot/correos/buscar.php`,
        {
            cod_operario:  operario.CodOperario,
            remitente:     remitente || '',
            palabras_clave: palabrasClave
        },
        { headers: HEADERS, timeout: TIMEOUT }
    );

    if (!resp.data?.success) {
        return { respuesta: `❌ ${resp.data?.message || 'Error al buscar correos.'}`, subflow: null };
    }

    const correos = resp.data.data || [];
    if (correos.length === 0) {
        const query = remitente ? `"${remitente}"` : palabrasClave.join(', ');
        return { respuesta: `🔍 No encontré correos relacionados con ${query}.`, subflow: null };
    }

    const lineas = correos.map((c, i) =>
        `📩 *[${i + 1}] ${c.asunto}*\nDe: ${c.de}\nFecha: ${formatearFecha(c.fecha)}\nVista previa: "${c.preview || '(sin texto)'}"`
    ).join('\n\n─────\n\n');

    return {
        respuesta: `🔍 *Resultados de búsqueda*\nEncontré ${correos.length} correo(s):\n\n${lineas}`,
        subflow: null
    };
}

async function correosPendientes(operario) {
    const resp = await axios.post(
        `${API_BASE_URL}/api/bot/correos/pendientes.php`,
        { cod_operario: operario.CodOperario },
        { headers: HEADERS, timeout: TIMEOUT }
    );

    if (!resp.data?.success) {
        return { respuesta: `❌ ${resp.data?.message || 'Error al obtener correos pendientes.'}`, subflow: null };
    }

    const correos = resp.data.data || [];
    if (correos.length === 0) {
        return { respuesta: `📬 No tienes correos no leídos en los últimos 7 días. ✅`, subflow: null };
    }

    const lista = correos.map((c, i) =>
        `${i + 1}. ${extraerNombre(c.de)} — _"${c.asunto}"_ (${c.cuando})`
    ).join('\n');

    return {
        respuesta: `📬 *Correos pendientes por leer*\nTienes ${correos.length} sin leer (últimos 7 días):\n\n${lista}`,
        subflow: null
    };
}

// ─────────────────────────────────────────────
//  Helpers de formato
// ─────────────────────────────────────────────

function formatearFecha(fechaStr) {
    if (!fechaStr) return '';
    try {
        const d = new Date(fechaStr);
        return d.toLocaleDateString('es-NI', {
            day: 'numeric', month: 'short', year: 'numeric',
            timeZone: 'America/Managua'
        });
    } catch (_) { return fechaStr; }
}

/** Extrae el nombre visible de una cadena tipo "Juan Pérez <juan@empresa.com>" */
function extraerNombre(fromAddress = '') {
    const match = fromAddress.match(/^(.+?)\s*</);
    return match ? match[1].replace(/["']/g, '').trim() : fromAddress;
}

module.exports = { ejecutar };
