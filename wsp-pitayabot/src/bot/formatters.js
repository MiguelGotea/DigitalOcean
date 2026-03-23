'use strict';

/**
 * formatters.js — Formatea respuestas del bot en texto WhatsApp
 */

/**
 * Formatea el mensaje de confirmación enviado al usuario antes de ejecutar.
 * @param {string} frase  frase_confirmacion generada por la IA
 * @returns {string}
 */
function formatearConfirmacion(frase) {
    return `🤖 *PitayaBot*\n\n${frase}\n\n¿Confirmas? Responde *sí* para ejecutar o *no* para cancelar.`;
}

/**
 * Mensaje cuando el usuario no está registrado o no tiene permiso.
 * @returns {string}
 */
function formatearNoRegistrado() {
    return `❌ *PitayaBot*\n\nNo estás registrado para usar este asistente o tu permiso no está activo.\n\nContacta al área de RRHH o TI para obtener acceso.`;
}

/**
 * Mensaje de error genérico amigable.
 * @param {string} detalle
 * @returns {string}
 */
function formatearError(detalle = '') {
    return `⚠️ *PitayaBot*\n\nOcurrió un problema procesando tu solicitud.${detalle ? `\n_${detalle}_` : ''}\n\nInténtalo de nuevo en unos momentos.`;
}

/**
 * Mensaje de acción cancelada.
 * @returns {string}
 */
function formatearCancelado() {
    return `✅ Entendido, acción cancelada. Puedes enviarme una nueva solicitud cuando quieras.`;
}

/**
 * Mensaje de acción ejecutada (placeholder para Etapa 1).
 * @param {string} intent
 * @returns {string}
 */
function formatearAccionEjecutada(intent) {
    return `✅ *PitayaBot*\n\nAcción *${intent}* confirmada y registrada.\n\n_(Implementación completa disponible próximamente)_`;
}

/**
 * Mensaje cuando la IA no entendió la solicitud.
 * @returns {string}
 */
function formatearNoEntendido() {
    return `🤔 *PitayaBot*\n\nNo pude entender bien tu solicitud. ¿Puedes reformularla?\n\nPuedo ayudarte con:\n• Crear/buscar tareas y reuniones\n• Tomar notas y decisiones\n• Buscar/enviar correos\n• Consultar tu agenda`;
}

module.exports = {
    formatearConfirmacion,
    formatearNoRegistrado,
    formatearError,
    formatearCancelado,
    formatearAccionEjecutada,
    formatearNoEntendido
};
