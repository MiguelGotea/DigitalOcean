'use strict';

/**
 * confirmManager.js — Gestión de estado de confirmación pendiente por usuario
 *
 * Antes de ejecutar cualquier acción el bot:
 *  1. Guarda el estado pendiente en BD (expira 5 min)
 *  2. Envía `frase_confirmacion` al usuario con "¿Confirmas?"
 *  3. Si el usuario responde "sí" → ejecuta; "no" → cancela; otro → nuevo mensaje
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { log, logError } = require('../utils/logger');

// Palabras que el usuario puede decir para confirmar
const PALABRAS_CONFIRMACION = new Set([
    'sí', 'si', 'confirmo', 'dale', 'ok', 'correcto', 'yes', 'va',
    'claro', 'exacto', 'adelante', 'procede', 'hazlo', 'sip', 'aha', '👍'
]);

// Palabras que el usuario puede decir para cancelar
const PALABRAS_CANCELACION = new Set([
    'no', 'cancelar', 'cancela', 'nope', 'negativo', 'para', 'detén', 'olvídalo'
]);

/**
 * Guarda o actualiza el estado pendiente de confirmación para un celular.
 * @param {number} codOperario
 * @param {string} celular  Número local (ej: 88112233)
 * @param {string} intent
 * @param {object} payload  Entidades extraídas por IA
 * @param {string} frase    Texto que se mostró al usuario para confirmar
 */
async function guardarEstado(codOperario, celular, intent, payload, frase) {
    try {
        const resp = await axios.post(
            `${API_BASE_URL}/api/bot/confirmacion/guardar.php`,
            { cod_operario: codOperario, celular, intent, payload, frase },
            { headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000 }
        );
        return resp.data?.success === true;
    } catch (err) {
        logError('CONFIRM', 'Error guardando estado de confirmación', err);
        return false;
    }
}

/**
 * Obtiene el estado pendiente de confirmación para un celular (si no expiró).
 * @param {string} celular
 * @returns {object|null}  { cod_operario, intent, payload, frase } o null
 */
async function obtenerEstado(celular) {
    try {
        const resp = await axios.get(
            `${API_BASE_URL}/api/bot/confirmacion/obtener.php`,
            {
                params:  { celular },
                headers: { 'X-WSP-Token': WSP_TOKEN },
                timeout: 8_000
            }
        );
        if (resp.data?.success && resp.data?.data) {
            return resp.data.data;
        }
        return null;
    } catch (err) {
        logError('CONFIRM', 'Error obteniendo estado de confirmación', err);
        return null;
    }
}

/**
 * Borra/invalida el estado pendiente de confirmación para un celular.
 * @param {string} celular
 */
async function borrarEstado(celular) {
    try {
        await axios.post(
            `${API_BASE_URL}/api/bot/confirmacion/borrar.php`,
            { celular },
            { headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000 }
        );
    } catch (err) {
        logError('CONFIRM', 'Error borrando estado de confirmación', err);
    }
}

/**
 * Determina si un texto del usuario es una confirmación.
 * @param {string} texto
 * @returns {'confirmar'|'cancelar'|'nuevo_mensaje'}
 */
function evaluarRespuesta(texto) {
    const limpio = texto.trim().toLowerCase()
        .replace(/[¿?¡!.,;:]/g, '').trim();

    if (PALABRAS_CONFIRMACION.has(limpio)) return 'confirmar';
    if (PALABRAS_CANCELACION.has(limpio))  return 'cancelar';
    return 'nuevo_mensaje';
}

module.exports = { guardarEstado, obtenerEstado, borrarEstado, evaluarRespuesta };
