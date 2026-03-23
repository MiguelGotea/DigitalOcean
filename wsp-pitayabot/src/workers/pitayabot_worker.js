'use strict';

const { procesarMensaje } = require('../bot/messageHandler');
const { log, logError }   = require('../utils/logger');

const MODULO = 'BOT_WORKER';

function iniciarPitayaBot(cliente) {
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


    // ── Mensajes de texto normales ──
    cliente.on('message', async (msg) => {
        try {
            await procesarMensaje(cliente, msg);
        } catch (err) {
            logError(MODULO, 'Error no capturado procesando mensaje', err);
        }
    });

    // ── Votos de encuesta (Poll) — cuando el usuario elige Sí o No ──
    cliente.on('vote_update', async (vote) => {
        try {
            // vote.voter = JID del votante, vote.selectedOptions = [{name: '✅ Sí, ejecutar'}]
            const jid      = vote.voter;
            const opciones = vote.selectedOptions || [];
            if (!jid || !opciones.length) return;

            const seleccion = opciones[0].name || '';
            const esSi = seleccion.includes('Sí') || seleccion.includes('Si') || seleccion.includes('sí');
            const esNo = seleccion.includes('No') || seleccion.includes('no');

            if (!esSi && !esNo) return;

            log(MODULO, `📊 Voto recibido de ${jid}: "${seleccion}" → ${esSi ? 'confirmar' : 'cancelar'}`);

            // Construir un objeto msg sintético para reutilizar procesarMensaje
            const msgSintetico = {
                from:   jid,
                fromMe: false,
                type:   'chat',
                body:   esSi ? 'si' : 'no'
            };
            await procesarMensaje(cliente, msgSintetico);

        } catch (err) {
            logError(MODULO, 'Error procesando vote_update', err);
        }
    });

    log(MODULO, `✅ Worker registrado. PitayaBot listo para recibir mensajes.`);
}

module.exports = { iniciarPitayaBot };
