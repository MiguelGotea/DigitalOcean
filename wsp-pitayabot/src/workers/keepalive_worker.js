'use strict';

/**
 * keepalive_worker.js — Worker de Keepalive para wsp-pitayabot
 *
 * Envía un mensaje corto periódico para evitar que el bot
 * entre en modo zombie por inactividad de WhatsApp Web.
 */

const { obtenerCliente } = require('../whatsapp/client');

const iniciarKeepalive = (_cliente) => {
    const KEEPALIVE_DESTINO = process.env.KEEPALIVE_DESTINO;
    const INSTANCIA         = process.env.WSP_INSTANCIA || 'wsp-pitayabot';

    if (!KEEPALIVE_DESTINO) {
        console.warn(`[${INSTANCIA}] ⚠️  KEEPALIVE_DESTINO no definido. Keepalive desactivado.`);
        return;
    }

    const mensajes = ['.', 'ok', '✓', 'ping', '👍'];
    let index = 0;

    const enviarKeepalive = async () => {
        try {
            const cliente = obtenerCliente();
            if (!cliente) return;

            const state = await cliente.getState();
            if (state === 'CONNECTED') {
                const mensaje = mensajes[index];
                index = (index + 1) % mensajes.length;
                const chatId = KEEPALIVE_DESTINO.includes('@')
                    ? KEEPALIVE_DESTINO
                    : `${KEEPALIVE_DESTINO}@c.us`;
                await cliente.sendMessage(chatId, mensaje);
                console.log(`[${INSTANCIA}] 🔄 Keepalive enviado: ${mensaje}`);
            }
        } catch (err) {
            console.error(`[${INSTANCIA}] ❌ Error en keepalive: ${err.message}`);
        }
    };

    console.log(`[${INSTANCIA}] 🕒 Keepalive: inicio en 5m, frecuencia cada 12h`);
    setTimeout(() => {
        enviarKeepalive();
        setInterval(enviarKeepalive, 720 * 60 * 1000);
    }, 5 * 60 * 1000);
};

module.exports = { iniciarKeepalive };
