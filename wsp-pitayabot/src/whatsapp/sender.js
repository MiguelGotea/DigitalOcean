'use strict';

/**
 * sender.js — Helpers de envío de mensajes para wsp-pitayabot
 */

/**
 * Genera un delay aleatorio entre min y max segundos (anti-ban)
 */
function delayAleatorio(minSeg, maxSeg) {
    const ms = (Math.random() * (maxSeg - minSeg) + minSeg) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envía un mensaje de texto a un chatId con delay anti-ban.
 * @param {object} cliente   - Cliente whatsapp-web.js activo
 * @param {string} chatId    - JID destino (ej: '50588112233@c.us')
 * @param {string} texto     - Texto a enviar
 * @param {boolean} conDelay - Aplicar delay aleatorio antes de enviar (default true)
 */
async function enviarMensaje(cliente, chatId, texto, conDelay = true) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS ?? '2');
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS ?? '6');

    if (conDelay) {
        await delayAleatorio(DELAY_MIN, DELAY_MAX);
    }

    await cliente.sendMessage(chatId, texto);
}

module.exports = { enviarMensaje, delayAleatorio };
