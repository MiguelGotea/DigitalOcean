'use strict';

/**
 * sender.js — Envío de mensajes a colaboradores
 * Variables disponibles: {{nombre}}, {{fecha_planilla}}
 */

/**
 * Construye el número en formato WhatsApp: "<numero>@c.us"
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
 * Personaliza el mensaje reemplazando variables del colaborador
 * Variables: {{nombre}}, {{fecha_planilla}}
 */
function personalizarMensaje(plantilla, datos) {
    return plantilla
        .replace(/\{\{nombre\}\}/gi, datos.nombre || 'Colaborador')
        .replace(/\{\{fecha_planilla\}\}/gi, datos.fecha_planilla || '');
}

/**
 * Envía un lote de destinatarios de una programación de planilla
 * @param {object} client         - Cliente whatsapp-web.js activo
 * @param {object} campana        - Objeto con id, mensaje, imagen_url
 * @param {Array}  destinatarios  - Lista de destinatarios (cod_operario, nombre, telefono, fecha_planilla)
 * @param {Function} reportarResultado - Función para reportar a la API
 */
async function enviarLote(client, campana, destinatarios, reportarResultado) {
    const DELAY_MIN = parseInt(process.env.DELAY_MIN_SEGUNDOS) || 8;
    const DELAY_MAX = parseInt(process.env.DELAY_MAX_SEGUNDOS) || 25;

    console.log(`📨 Planilla #${campana.id}: enviando ${destinatarios.length} notificacion(es)...`);

    for (const dest of destinatarios) {
        const numeroWA = formatearNumeroWA(dest.telefono);
        const mensajePersonal = personalizarMensaje(campana.mensaje, {
            nombre: dest.nombre,
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
                await client.sendMessage(numeroWA, mensajePersonal);
            }

            console.log(`  ✅ Enviado a ${dest.telefono} (${dest.nombre})`);

        } catch (err) {
            resultado = 'error';
            detalle = err.message;
            console.error(`  ❌ Error con ${dest.telefono}: ${err.message}`);
        }

        // Reportar resultado a la API bridge
        await reportarResultado(campana.id, dest.id, resultado, detalle);

        // Delay anti-ban entre mensajes
        await delayAleatorio(DELAY_MIN, DELAY_MAX);
    }

    console.log(`✅ Lote de planilla #${campana.id} completado.`);
}

module.exports = { enviarLote, formatearNumeroWA };
