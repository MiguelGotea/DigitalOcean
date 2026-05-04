'use strict';

const { procesarMensaje } = require('../bot/messageHandler');
const { log, logError }   = require('../utils/logger');

const MODULO = 'BOT_WORKER';

let clienteRegistrado = null;

function iniciarPitayaBot(cliente) {
    // Si ya está registrado en este mismo objeto cliente, no volver a registrar
    if (clienteRegistrado === cliente) {
        log(MODULO, '🔄 PitayaBot ya registrado en este cliente — omitiendo.');
        return;
    }
    clienteRegistrado = cliente;

    log(MODULO, '🤖 PitayaBot worker iniciado — escuchando mensajes...');

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
