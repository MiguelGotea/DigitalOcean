'use strict';

const { obtenerCliente } = require('../whatsapp/client');

/**
 * Worker de Keepalive por Mensaje Real
 * Propósito: Evitar que la sesión de WhatsApp Web entre en modo zombie por inactividad.
 * Envía un mensaje corto cada 15 minutos a un destino configurado.
 * @param {object} _cliente - (Obsoleto) Ya no se usa, el worker obtiene el cliente dinámicamente.
 */

const iniciarKeepalive = (_cliente) => {
    const KEEPALIVE_DESTINO = process.env.KEEPALIVE_DESTINO;
    const INSTANCIA = process.env.WSP_INSTANCIA || 'WSP';

    if (!KEEPALIVE_DESTINO) {
        console.warn(`[${INSTANCIA}] ⚠️  KEEPALIVE_DESTINO no definido en .env. Keepalive desactivado.`);
        return;
    }

    const mensajes = ['.', 'ok', '✓', 'ping', '👍'];
    let index = 0;

    const enviarKeepalive = async () => {
        try {
            const cliente = obtenerCliente();
            if (!cliente) {
                // console.log(`[${INSTANCIA}] ⏳ Keepalive saltado (Cliente no inicializado)`);
                return;
            }

            // Verificar estado antes de intentar enviar
            const state = await cliente.getState();
            if (state === 'CONNECTED') {
                const mensaje = mensajes[index];
                index = (index + 1) % mensajes.length;
                
                // Formatear destino (número o grupo)
                const chatId = KEEPALIVE_DESTINO.includes('@') 
                    ? KEEPALIVE_DESTINO 
                    : `${KEEPALIVE_DESTINO}@c.us`;
                
                await cliente.sendMessage(chatId, mensaje);
                console.log(`[${INSTANCIA}] 🔄 Keepalive enviado a ${KEEPALIVE_DESTINO}: ${mensaje}`);
            } else {
                console.log(`[${INSTANCIA}] ⏳ Keepalive saltado (estado: ${state})`);
            }
        } catch (err) {
            // Manejo silencioso: un fallo de keepalive no debe tumbar el proceso
            console.error(`[${INSTANCIA}] ❌ Error en envío de keepalive: ${err.message}`);
        }
    };

    // 1. Esperar 5 minutos tras arrancar para que la sesión se estabilice
    console.log(`[${INSTANCIA}] 🕒 Keepalive programado: inicio en 5m, frecuencia cada 15m`);
    
    setTimeout(() => {
        enviarKeepalive();
        
        // 2. Ejecutar cada 15 minutos
        setInterval(enviarKeepalive, 15 * 60 * 1000);
    }, 5 * 60 * 1000);
};

module.exports = { iniciarKeepalive };
