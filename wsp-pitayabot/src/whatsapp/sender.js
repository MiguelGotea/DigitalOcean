'use strict';

/**
 * sender.js — Helpers de envío de mensajes para wsp-pitayabot
 */

function delayAleatorio(minSeg, maxSeg) {
    const ms = (Math.random() * (maxSeg - minSeg) + minSeg) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarMensaje(cliente, chatId, texto, conDelay = true) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS ?? '2');
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS ?? '6');
    if (conDelay) await delayAleatorio(DELAY_MIN, DELAY_MAX);
    await cliente.sendMessage(chatId, texto);
}

/**
 * Envia mensaje de confirmacion con opcion si / no en texto plano.
 */
async function enviarConfirmacion(cliente, chatId, frase) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS ?? '1');
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS ?? '3');
    await delayAleatorio(DELAY_MIN, DELAY_MAX);

    const texto = `🤖 *PitayaBot*\n\n${frase}\n\nResponde:\n✅ *si* — ejecutar\n❌ *no* — cancelar`;
    await cliente.sendMessage(chatId, texto);
}

module.exports = { enviarMensaje, enviarConfirmacion, delayAleatorio };

