'use strict';

/**
 * sender.js — Helpers de envío de mensajes para wsp-pitayabot
 */

const { Poll } = require('whatsapp-web.js');

function delayAleatorio(minSeg, maxSeg) {
    const ms = (Math.random() * (maxSeg - minSeg) + minSeg) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envía un mensaje de texto a un chatId con delay anti-ban.
 */
async function enviarMensaje(cliente, chatId, texto, conDelay = true) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS ?? '2');
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS ?? '6');
    if (conDelay) await delayAleatorio(DELAY_MIN, DELAY_MAX);
    await cliente.sendMessage(chatId, texto);
}

/**
 * Envía una encuesta (Poll) Sí / No como confirmación.
 * Si el Poll no está disponible, usa texto plano como fallback.
 * @param {object} cliente
 * @param {string} chatId
 * @param {string} frase  Descripción de la acción a confirmar
 */
async function enviarConfirmacion(cliente, chatId, frase) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS ?? '1');
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS ?? '3');
    await delayAleatorio(DELAY_MIN, DELAY_MAX);

    try {
        const poll = new Poll(frase, ['✅ Sí, ejecutar', '❌ No, cancelar'], { allowMultipleAnswers: false });
        await cliente.sendMessage(chatId, poll);
    } catch {
        // Fallback: texto plano
        await cliente.sendMessage(chatId,
            `🤖 *PitayaBot*\n\n${frase}\n\n¿Confirmas? Responde *sí* para ejecutar o *no* para cancelar.`
        );
    }
}

module.exports = { enviarMensaje, enviarConfirmacion, delayAleatorio };

