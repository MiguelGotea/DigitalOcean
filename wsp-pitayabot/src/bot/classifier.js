'use strict';

/**
 * classifier.js — Clasificador de intenciones
 *
 * Delega 100% la clasificación al endpoint PHP clasificar.php en Hostinger.
 * Las API keys, la cascada de proveedores y toda la lógica de IA
 * viven exclusivamente en el ERP (AIService.php / clasificar.php).
 *
 * Cascada en PHP: google → openai → deepseek → mistral →
 *                 cerebras → openrouter → huggingface → groq
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { log, logError }           = require('../utils/logger');

const MODULO = 'CLASSIFIER';

/**
 * Clasifica el mensaje del usuario llamando al endpoint PHP.
 * @param {string} mensaje  Texto enviado por el usuario
 * @returns {object} { intent, entidades, confianza, ambiguo, frase_confirmacion, proveedor_usado }
 */
async function clasificar(mensaje) {
    try {
        log(MODULO, `🔍 Clasificando: "${mensaje.slice(0, 60)}..."`);

        const resp = await axios.post(
            `${API_BASE_URL}/api/bot/ia/clasificar.php`,
            { mensaje },
            {
                headers: { 'X-WSP-Token': WSP_TOKEN, 'Content-Type': 'application/json' },
                timeout: 35_000   // margen para que la cascada de IA complete
            }
        );

        const data = resp.data;

        if (!data?.success || !data?.data) {
            throw new Error(data?.message || 'Respuesta inesperada de clasificar.php');
        }

        const resultado = data.data;
        log(MODULO, `✅ Clasificado via ${resultado.proveedor_usado}: ${resultado.intent} (conf: ${resultado.confianza})`);
        return resultado;

    } catch (err) {
        logError(MODULO, 'Error al clasificar mensaje', err);

        // Fallback seguro — el messageHandler lo tratará como desconocido
        return {
            intent:            'desconocido',
            entidades:         {},
            confianza:         0,
            ambiguo:           true,
            frase_confirmacion:'No pude entender tu mensaje. ¿Puedes reformularlo?',
            proveedor_usado:   null
        };
    }
}

module.exports = { clasificar };
