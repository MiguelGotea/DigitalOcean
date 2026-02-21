'use strict';

/**
 * Configuración de la API puente (api.batidospitaya.com)
 * El VPS NUNCA se conecta directamente a la BD — todo pasa por la API.
 */

require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.batidospitaya.com';
const WSP_TOKEN = process.env.WSP_TOKEN;

if (!WSP_TOKEN) {
    console.error('❌ FATAL: WSP_TOKEN no está definido en .env');
    process.exit(1);
}

module.exports = { API_BASE_URL, WSP_TOKEN };
