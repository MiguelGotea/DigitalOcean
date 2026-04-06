'use strict';

/**
 * Configuración de la API puente (api.batidospitaya.com)
 * El VPS NUNCA se conecta directamente a la BD — todo pasa por la API.
 */

require('dotenv').config();

const API_BASE_URL  = process.env.API_BASE_URL  || 'https://api.batidospitaya.com';
const WSP_TOKEN     = process.env.WSP_TOKEN;
const WSP_INSTANCIA = process.env.WSP_INSTANCIA || 'wsp-pitayabot';

// [Sol. 1] API Key de Google Gemini para clasificar directo (sin pasar por Hostinger)
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || null;

// [Sol. 3] Confianza mínima para ejecutar SIN pedir confirmación (0.0–1.0, default 0.97)
const AUTO_EXEC_MIN_CONFIANZA = parseFloat(process.env.AUTO_EXEC_MIN_CONFIANZA ?? '0.97');

if (!WSP_TOKEN) {
    console.error('❌ FATAL: WSP_TOKEN no está definido en .env');
    process.exit(1);
}

module.exports = { API_BASE_URL, WSP_TOKEN, WSP_INSTANCIA, GOOGLE_AI_API_KEY, AUTO_EXEC_MIN_CONFIANZA };
