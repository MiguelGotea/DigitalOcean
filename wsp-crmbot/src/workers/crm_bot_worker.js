'use strict';

/**
 * crm_bot_worker.js
 * Listener de mensajes entrantes para la instancia wsp-crmbot
 * Se activa solo cuando WSP_INSTANCIA === 'wsp-crmbot'
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN, WSP_INSTANCIA } = require('../config/api');

let clienteRef = null;

/**
 * Inicializa el listener de mensajes CRM
 * @param {WAWebJS.Client} cliente – instancia del cliente WhatsApp Web
 */
function iniciarCRMBot(cliente) {
    if (WSP_INSTANCIA !== 'wsp-crmbot') return;
    clienteRef = cliente;

    console.log('🤖 CRM Bot Worker iniciado — escuchando mensajes entrantes...');

    cliente.on('message', async (msg) => {
        try {
            // Ignorar mensajes de grupos, estados y propios
            if (msg.isGroupMsg || msg.isStatus || msg.fromMe) return;

            const numero_cliente = msg.from.replace('@c.us', '').replace(/\D/g, '');
            const texto = msg.body ? msg.body.trim() : '';

            if (!texto && msg.type === 'text') return; // vacío

            console.log(`📨 Mensaje entrante CRM: ${numero_cliente} → "${texto.substring(0, 50)}"`);

            // Enviar al motor del bot (API)
            const resp = await axios.post(
                `${API_BASE_URL}/api/crm/recibir_mensaje.php`,
                {
                    instancia: WSP_INSTANCIA,
                    numero_cliente,
                    texto,
                    tipo: msg.type || 'text',
                    media_url: null         // futuro
                },
                {
                    headers: { 'X-WSP-Token': WSP_TOKEN },
                    timeout: 15_000
                }
            );

            const data = resp.data;

            // Si el bot debe responder, enviar el mensaje
            if (data.responder && data.texto_respuesta) {
                const chatId = msg.from; // ej: 50588888888@c.us

                if (data.media_url) {
                    try {
                        const { MessageMedia } = require('whatsapp-web.js');
                        const media = await MessageMedia.fromUrl(data.media_url);
                        await cliente.sendMessage(chatId, media, { caption: data.texto_respuesta });
                        console.log(`🤖 Bot respondió con imagen a ${numero_cliente}`);
                    } catch (e) {
                        console.error(`⚠️ Error al enviar imagen al cliente ${numero_cliente}:`, e.message);
                        // Fallback: enviar solo el texto si falla la imagen
                        await cliente.sendMessage(chatId, data.texto_respuesta);
                    }
                } else {
                    await cliente.sendMessage(chatId, data.texto_respuesta);
                    console.log(`🤖 Bot respondió a ${numero_cliente}: "${data.texto_respuesta.substring(0, 60)}"`);
                }
            }

        } catch (err) {
            console.error('⚠️  CRM Bot Worker — error procesando mensaje:', err.message);
        }
    });
}

module.exports = { iniciarCRMBot };
