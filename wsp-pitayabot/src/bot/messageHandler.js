'use strict';

/**
 * messageHandler.js — Router principal de mensajes del bot
 *
 * Flujo:
 *  1. Normalizar número → identificar operario en BD
 *  2. Verificar si hay estado de confirmación pendiente → procesar respuesta
 *  3. Si no hay estado pendiente → clasificar con IA
 *  4. confianza >= 0.7 y no ambiguo → guardar estado + pedir confirmación
 *  5. confianza < 0.7 o ambiguo → pedir reformulación
 *  6. Tras confirmación "sí" → ejecutar acción (registrar log) → borrar estado
 *  7. Tras confirmación "no" → borrar estado → responder cancelado
 */

const axios   = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { normalizarNumero, formatearJID, esGrupo } = require('../utils/phone');
const { log, logError } = require('../utils/logger');
const { clasificar }       = require('./classifier');
const {
    guardarEstado, obtenerEstado, borrarEstado, evaluarRespuesta
} = require('./confirmManager');
const {
    formatearConfirmacion, formatearNoRegistrado, formatearError,
    formatearCancelado, formatearAccionEjecutada, formatearNoEntendido
} = require('./formatters');
const { enviarMensaje } = require('../whatsapp/sender');

const MODULO = 'MSG_HANDLER';

// ── Umbral de confianza para confirmar sin preguntar ──
const CONFIANZA_MINIMA = 0.7;

/**
 * Identifica al operario por su número de celular normalizado.
 * @param {string} celular  Número local (ej: 88112233)
 * @returns {object|null}   Datos del operario o null
 */
async function identificarOperario(celular, lid = null) {
    try {
        const resp = await axios.get(
            `${API_BASE_URL}/api/bot/auth/identificar.php`,
            {
                params:  { celular, lid },
                headers: { 'X-WSP-Token': WSP_TOKEN },
                timeout: 8_000
            }
        );
        if (resp.data?.success && resp.data?.data) {
            return resp.data.data;
        }

        // Si no tuvo éxito, loguear la razón si existe (para depuración)
        if (!resp.data?.success) {
            log(MODULO, `⚠️ Fallo identificación: ${resp.data?.error || resp.data?.message || 'Razón desconocida'}`, resp.data);
        }
        return null;
    } catch (err) {
        logError(MODULO, 'Error identificando operario', err);
        return null;
    }
}

/**
 * Registra la operación en el log de BD.
 */
async function registrarLog({ codOperario, celular, intent, mensajeEntrada, respuestaBot, exitoso, errorDetalle, duracionMs }) {
    try {
        await axios.post(
            `${API_BASE_URL}/api/bot/logs/registrar.php`,
            {
                cod_operario:    codOperario,
                celular,
                intent,
                mensaje_entrada: mensajeEntrada,
                respuesta_bot:   respuestaBot,
                exitoso:         exitoso ? 1 : 0,
                error_detalle:   errorDetalle || null,
                duracion_ms:     duracionMs
            },
            { headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000 }
        );
    } catch (err) {
        logError(MODULO, 'Error registrando log de operación', err);
    }
}

/**
 * Procesa un mensaje entrante de WhatsApp.
 * @param {object} cliente  Cliente whatsapp-web.js
 * @param {object} msg      Mensaje de whatsapp-web.js
 */
async function procesarMensaje(cliente, msg) {
    const inicio = Date.now();

    // Solo procesar mensajes de texto entrantes, no de grupos
    if (esGrupo(msg.from))  return;
    if (msg.fromMe)          return;
    if (msg.type !== 'chat') return;

    const jid         = msg.from;
    let celular       = normalizarNumero(jid);

    // ── 0. Resolver LID a Número si es necesario ──
    if (jid.includes('@lid')) {
        try {
            const contact = await cliente.getContactById(jid);
            if (contact && contact.number) {
                log(MODULO, `🔍 Resolviendo LID ${jid} → PN: ${contact.number}`);
                celular = normalizarNumero(`${contact.number}@c.us`);
            }
        } catch (e) {
            log(MODULO, `⚠️ No se pudo resolver LID ${jid}: ${e.message}`);
        }
    }

    const textoRaw    = (msg.body || '').trim();
    if (!textoRaw) return;

    log(MODULO, `📨 Mensaje de ${celular} (${jid}): "${textoRaw.slice(0, 80)}"`);

    // ── 1. Identificar operario ──
    const operario = await identificarOperario(celular, jid);
    if (!operario) {
        const respuesta = formatearNoRegistrado();
        await enviarMensaje(cliente, jid, respuesta, false);
        log(MODULO, `🚫 Número no registrado: ${celular} (jid: ${jid})`);
        return;
    }

    const codOperario = operario.CodOperario;
    log(MODULO, `👤 Operario identificado: ${operario.Nombre} ${operario.Apellido} (cod: ${codOperario})`);

    let respuestaFinal = '';
    let intentFinal    = 'desconocido';
    let exitoso        = true;
    let errorDetalle   = null;

    try {
        // ── 2. Verificar estado de confirmación pendiente ──
        const estadoPendiente = await obtenerEstado(celular);

        if (estadoPendiente) {
            const decision = evaluarRespuesta(textoRaw);
            log(MODULO, `🔄 Estado pendiente encontrado para ${celular}: decision=${decision}`);

            if (decision === 'confirmar') {
                // Ejecutar acción (Etapa 1: solo registrar, Etapas 2+ implementarán la lógica real)
                intentFinal    = estadoPendiente.intent;
                respuestaFinal = formatearAccionEjecutada(estadoPendiente.intent);
                await borrarEstado(celular);
                log(MODULO, `✅ Acción confirmada y ejecutada: ${intentFinal}`);

            } else if (decision === 'cancelar') {
                intentFinal    = `cancelado_${estadoPendiente.intent}`;
                respuestaFinal = formatearCancelado();
                await borrarEstado(celular);
                log(MODULO, `🚫 Acción cancelada por el usuario`);

            } else {
                // El usuario envió algo nuevo — tratar como nuevo mensaje (borrar estado anterior)
                await borrarEstado(celular);
                log(MODULO, `🔁 Nuevo mensaje detectado (ignorando estado previo) — reclasificando...`);
                // Continuar al paso 3 (sin return)
                return await clasificarYConfirmar(cliente, jid, celular, codOperario, textoRaw, inicio);
            }

        } else {
            // ── 3. Clasificar con IA ──
            return await clasificarYConfirmar(cliente, jid, celular, codOperario, textoRaw, inicio);
        }

    } catch (err) {
        logError(MODULO, 'Error procesando mensaje', err);
        respuestaFinal = formatearError();
        exitoso        = false;
        errorDetalle   = err.message;
    }

    // Enviar respuesta
    await enviarMensaje(cliente, jid, respuestaFinal, false);

    // Registrar log
    await registrarLog({
        codOperario,
        celular,
        intent:         intentFinal,
        mensajeEntrada: textoRaw,
        respuestaBot:   respuestaFinal,
        exitoso,
        errorDetalle,
        duracionMs:     Date.now() - inicio
    });
}

/**
 * Sub-función: clasifica con IA y envía confirmación o pide reformulación.
 */
async function clasificarYConfirmar(cliente, jid, celular, codOperario, texto, inicio) {
    let respuestaFinal = '';
    let intentFinal    = 'desconocido';
    let exitoso        = true;
    let errorDetalle   = null;

    try {
        const clasificacion = await clasificar(texto);
        intentFinal = clasificacion.intent;
        log(MODULO, `🧠 Clasificación: intent=${clasificacion.intent} conf=${clasificacion.confianza} ambiguo=${clasificacion.ambiguo}`);

        if (
            clasificacion.confianza >= CONFIANZA_MINIMA &&
            !clasificacion.ambiguo &&
            clasificacion.intent !== 'desconocido'
        ) {
            // Guardar estado y pedir confirmación
            const guardado = await guardarEstado(
                codOperario,
                celular,
                clasificacion.intent,
                clasificacion.entidades,
                clasificacion.frase_confirmacion
            );

            if (guardado) {
                respuestaFinal = formatearConfirmacion(clasificacion.frase_confirmacion);
                log(MODULO, `💬 Confirmación enviada al usuario para intent: ${intentFinal}`);
            } else {
                // Error guardando estado — responder error
                respuestaFinal = formatearError('No se pudo guardar la acción pendiente.');
                exitoso        = false;
            }

        } else {
            // Confianza baja o ambiguo
            respuestaFinal = formatearNoEntendido();
            log(MODULO, `🤔 Confianza baja o ambiguo — pidiendo reformulación`);
        }

    } catch (err) {
        logError(MODULO, 'Error en clasificarYConfirmar', err);
        respuestaFinal = formatearError();
        exitoso        = false;
        errorDetalle   = err.message;
    }

    await enviarMensaje(cliente, jid, respuestaFinal, false);

    await registrarLog({
        codOperario,
        celular,
        intent:         intentFinal,
        mensajeEntrada: texto,
        respuestaBot:   respuestaFinal,
        exitoso,
        errorDetalle,
        duracionMs:     Date.now() - inicio
    });
}

module.exports = { procesarMensaje };
