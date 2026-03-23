'use strict';

/**
 * pitayabot_worker.js — Worker principal de PitayaBot
 *
 * Registra el listener de mensajes entrantes en el cliente WhatsApp
 * y delega el procesamiento a messageHandler.
 */

const { procesarMensaje } = require('../bot/messageHandler');
const { log, logError }   = require('../utils/logger');

const MODULO = 'BOT_WORKER';

/**
 * Inicia el bot: registra listeners de mensajes en el cliente WA.
 * Se llama desde app.js via setReadyHook tras la conexión exitosa.
 *
 * @param {object} cliente  Cliente whatsapp-web.js activo
 */
function iniciarPitayaBot(cliente) {
    log(MODULO, '🤖 PitayaBot worker iniciado — escuchando mensajes...');

    // Escuchar mensajes entrantes (de otros hacia nosotros)
    cliente.on('message', async (msg) => {
        try {
            await procesarMensaje(cliente, msg);
        } catch (err) {
            logError(MODULO, 'Error no capturado procesando mensaje', err);
        }
    });

    log(MODULO, `✅ Worker registrado. PitayaBot listo para recibir mensajes.`);
}

module.exports = { iniciarPitayaBot };
