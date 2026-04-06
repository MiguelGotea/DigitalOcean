'use strict';

/**
 * classifier.js — Clasificador de intenciones (versión optimizada)
 *
 * Flujo de 3 capas, de más rápido a más lento:
 *
 *  [Capa 1 — local-regex] ~0ms
 *    preclasificar() analiza el mensaje con regex sin llamar a ninguna red.
 *    Si coincide con confianza ≥ 0.97, retorna inmediatamente.
 *
 *  [Capa 2 — Google directo] ~500ms–1.5s
 *    Si GOOGLE_AI_API_KEY está configurado, llama directamente a la API de
 *    Gemini desde el bot (DO → Google), eliminando el salto por Hostinger.
 *
 *  [Capa 3 — clasificar.php fallback] ~3–5s
 *    Si no hay API key local o Google falla, delega al endpoint PHP en
 *    Hostinger que tiene la cascada completa de proveedores.
 */

const axios  = require('axios');
const { API_BASE_URL, WSP_TOKEN, GOOGLE_AI_API_KEY } = require('../config/api');
const { preclasificar } = require('./preClassifier');
const { log, logError } = require('../utils/logger');

const MODULO = 'CLASSIFIER';

// ─── Prompt del sistema ───────────────────────────────────────────────────────

function buildSystemPrompt() {
    const tz   = 'America/Managua';
    const hoy  = new Date().toLocaleDateString('es-NI', {
        timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return `Eres un clasificador de intenciones para un asistente empresarial por WhatsApp.
El usuario trabaja en una empresa y te envía mensajes en español.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin backticks.

Intenciones disponibles:
- crear_tarea
- buscar_tarea
- modificar_tarea_fecha
- finalizar_tarea
- cancelar_tarea
- buscar_tareas_retrasadas
- resumen_tareas_semana
- crear_reunion
- buscar_reunion
- modificar_reunion_fecha
- cancelar_reunion
- resumen_reuniones_semana
- horarios_libres
- crear_nota
- buscar_nota
- crear_nota_decision
- enviar_correo
- buscar_correo
- correos_pendientes
- consulta_libre
- desconocido

Esquema de respuesta:
{
  "intent": "nombre_de_la_intencion",
  "entidades": {
    "titulo": null,
    "descripcion": null,
    "fecha": null,
    "hora": null,
    "participantes": [],
    "prioridad": null,
    "estado_destino": null,
    "contenido": null,
    "destinatario": null,
    "remitente": null,
    "palabras_clave": [],
    "fecha_consulta": null
  },
  "confianza": 0.95,
  "ambiguo": false,
  "frase_confirmacion": "Texto en español resumiendo la acción"
}

Hoy es: ${hoy}`;
}

// ─── Capa 2: Google Gemini directo ────────────────────────────────────────────

async function clasificarConGoogle(mensaje) {
    if (!GOOGLE_AI_API_KEY) return null; // No configurado

    const model    = 'gemini-2.0-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`;

    const payload = {
        contents: [{
            role: 'user',
            parts: [{ text: `${buildSystemPrompt()}\n\nMensaje del usuario:\n${mensaje}` }]
        }],
        generationConfig: {
            temperature:        0.1,
            maxOutputTokens:    512,
            response_mime_type: 'application/json'
        }
    };

    const resp = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8_000   // mucho más agresivo que el PHP (25s)
    });

    const texto = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) throw new Error('Respuesta vacía de Google Gemini');

    // Extraer JSON de la respuesta
    const inicio = texto.indexOf('{');
    const fin    = texto.lastIndexOf('}');
    if (inicio === -1 || fin === -1) throw new Error('No se encontró JSON en respuesta de Gemini');

    const resultado = JSON.parse(texto.slice(inicio, fin + 1));
    if (!resultado?.intent) throw new Error('JSON sin campo "intent"');

    return resultado;
}

// ─── Capa 3: Fallback → clasificar.php en Hostinger ──────────────────────────

async function clasificarConPHP(mensaje) {
    const resp = await axios.post(
        `${API_BASE_URL}/api/bot/ia/clasificar.php`,
        { mensaje },
        {
            headers: { 'X-WSP-Token': WSP_TOKEN, 'Content-Type': 'application/json' },
            timeout: 35_000
        }
    );

    const data = resp.data;
    if (!data?.success || !data?.data) {
        throw new Error(data?.message || 'Respuesta inesperada de clasificar.php');
    }

    return data.data;
}

// ─── Clasificador principal ───────────────────────────────────────────────────

/**
 * Clasifica el mensaje usando la cascada de 3 capas.
 * @param {string} mensaje
 * @returns {{ intent, entidades, confianza, ambiguo, frase_confirmacion, proveedor_usado }}
 */
async function clasificar(mensaje) {
    log(MODULO, `🔍 Clasificando: "${mensaje.slice(0, 60)}..."`);

    // ── Capa 1: Clasificador local por regex (0ms) ────────────────────────────
    const preResult = preclasificar(mensaje);
    if (preResult) {
        log(MODULO, `⚡ Clasificado via local-regex: ${preResult.intent} (conf: ${preResult.confianza})`);
        return preResult;
    }

    // ── Capa 2: Google Gemini directo (si hay API key) ────────────────────────
    if (GOOGLE_AI_API_KEY) {
        try {
            const resultado = await clasificarConGoogle(mensaje);
            log(MODULO, `✅ Clasificado via google-directo: ${resultado.intent} (conf: ${resultado.confianza})`);
            return { ...resultado, proveedor_usado: 'google-directo' };
        } catch (err) {
            logError(MODULO, `⚠️ Google directo falló (${err.message}), usando fallback PHP...`);
        }
    }

    // ── Capa 3: Fallback → clasificar.php ────────────────────────────────────
    try {
        const resultado = await clasificarConPHP(mensaje);
        log(MODULO, `✅ Clasificado via ${resultado.proveedor_usado}: ${resultado.intent} (conf: ${resultado.confianza})`);
        return resultado;
    } catch (err) {
        logError(MODULO, 'Error al clasificar mensaje', err);
    }

    // ── Fallback seguro ───────────────────────────────────────────────────────
    return {
        intent:             'desconocido',
        entidades:          {},
        confianza:          0,
        ambiguo:            true,
        frase_confirmacion: 'No pude entender tu mensaje. ¿Puedes reformularlo?',
        proveedor_usado:    null
    };
}

module.exports = { clasificar };
