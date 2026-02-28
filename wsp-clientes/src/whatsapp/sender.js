'use strict';

const { API_BASE_URL, WSP_TOKEN } = require('../config/api');

/**
 * Construye el número de teléfono en formato WhatsApp: "<numero>@c.us"
 * El número ya viene formateado con el + desde la API (se elimina el +)
 * @param {string} telefono  Ej: "+50588887777" o "88887777"
 * @returns {string}  "50588887777@c.us"
 */
function formatearNumeroWA(telefono) {
    const limpio = telefono.replace(/\D/g, '');
    return `${limpio}@c.us`;
}

/**
 * Genera un delay aleatorio entre min y max segundos
 */
function delayAleatorio(minSeg, maxSeg) {
    const ms = (Math.random() * (maxSeg - minSeg) + minSeg) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Personaliza el mensaje reemplazando variables
 * Variables disponibles: {{nombre}}, {{sucursal}}, {{fecha_planilla}}
 */
function personalizarMensaje(plantilla, datos) {
    return plantilla
        .replace(/\{\{nombre\}\}/gi, datos.nombre || 'Cliente')
        .replace(/\{\{sucursal\}\}/gi, datos.sucursal || '')
        .replace(/\{\{fecha_planilla\}\}/gi, datos.fecha_planilla || '');
}

/**
 * Envía un lote de destinatarios de una campaña
 * @param {object} client    - Cliente whatsapp-web.js activo
 * @param {object} campana   - Objeto con id, mensaje, imagen_url
 * @param {Array}  destinatarios - Lista de destinatarios
 * @param {object} reportarAPI  - Función para reportar a la API
 */
async function enviarLote(client, campana, destinatarios, reportarResultado) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS) || 8;
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS) || 25;

    console.log(`📨 Campaña #${campana.id}: enviando ${destinatarios.length} mensaje(s)...`);

    for (const dest of destinatarios) {
        const numeroWA = formatearNumeroWA(dest.telefono);
        const mensajePersonal = personalizarMensaje(campana.mensaje, {
            nombre: dest.nombre,
            sucursal: dest.sucursal || '',
            fecha_planilla: dest.fecha_planilla || ''
        });

        let resultado = 'exito';
        let detalle = null;

        try {
            // Verificar que el número existe en WhatsApp
            const existe = await client.isRegisteredUser(numeroWA);
            if (!existe) {
                throw new Error('Número no registrado en WhatsApp');
            }

            if (campana.imagen_url) {
                // Enviar imagen con caption
                const { MessageMedia } = require('whatsapp-web.js');
                const media = await MessageMedia.fromUrl(campana.imagen_url, {
                    unsafeMime: true
                });
                await client.sendMessage(numeroWA, media, { caption: mensajePersonal });
            } else {
                // Enviar solo texto
                await client.sendMessage(numeroWA, mensajePersonal);
            }

            console.log(`  ✅ Enviado a ${dest.telefono} (${dest.nombre})`);

        } catch (err) {
            resultado = 'error';
            detalle = err.message;
            console.error(`  ❌ Error con ${dest.telefono}: ${err.message}`);
        }

        // Reportar resultado a la API
        await reportarResultado(campana.id, dest.id, resultado, detalle);

        // Delay anti-ban entre mensajes
        await delayAleatorio(DELAY_MIN, DELAY_MAX);
    }

    console.log(`✅ Lote de campaña #${campana.id} completado.`);
}

module.exports = { enviarLote, formatearNumeroWA };
