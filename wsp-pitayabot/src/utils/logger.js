'use strict';

/**
 * logger.js — Logger con timestamp, PID y uptime para wsp-pitayabot
 */

/**
 * Emite un mensaje de log con prefijo de contexto.
 * @param {string} prefix  Identificador del módulo (ej: 'BOT', 'AUTH', 'CLASSIFIER')
 * @param {string} msg     Mensaje a loguear
 */
function log(prefix, msg) {
    const pid = process.pid;
    const ut  = Math.round(process.uptime());
    const ts  = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${ts}][PID:${pid}|UT:${ut}s][${prefix}] ${msg}`);
}

/**
 * Emite un mensaje de error de log.
 * @param {string} prefix
 * @param {string} msg
 * @param {Error|null} err
 */
function logError(prefix, msg, err = null) {
    log(prefix, `❌ ${msg}${err ? ': ' + err.message : ''}`);
    if (err && err.stack) console.error(err.stack);
}

module.exports = { log, logError };
