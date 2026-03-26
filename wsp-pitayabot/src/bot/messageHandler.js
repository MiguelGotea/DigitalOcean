'use strict';

/**
 * messageHandler.js — Router principal de mensajes del bot
 *
 * Flujo:
 *  1. Normalizar número → identificar operario
 *  2. ¿Hay estado pendiente?
 *     a. subflow = seleccion_lista → detectar número → ejecutar sobre tarea elegida
 *     b. normal → evaluar sí/no/nuevo_mensaje → ejecutar acción real / cancelar / reclasificar
 *  3. Sin estado pendiente → clasificar con IA → guardar estado + pedir confirmación
 */

const axios  = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { normalizarNumero, esGrupo } = require('../utils/phone');
const { log, logError } = require('../utils/logger');
const { clasificar }    = require('./classifier');
const {
    guardarEstado, obtenerEstado, borrarEstado, evaluarRespuesta
} = require('./confirmManager');
const {
    formatearConfirmacion, formatearNoRegistrado, formatearError,
    formatearCancelado, formatearNoEntendido
} = require('./formatters');
const { enviarMensaje, enviarConfirmacion }  = require('../whatsapp/sender');
const tareasHandler    = require('./handlers/tareasHandler');
const reunionesHandler = require('./handlers/reunionesHandler');
const notasHandler     = require('./handlers/notasHandler');
const correosHandler   = require('./handlers/correosHandler');

// prepararConfirmacion unificado: tareas + reuniones
async function prepararConfirmacion(intent, entidades, operario) {
    if (INTENTS_TAREAS.has(intent))    return tareasHandler.prepararConfirmacion(intent, entidades, operario);
    if (INTENTS_REUNIONES.has(intent)) return reunionesHandler.prepararConfirmacion(intent, entidades, operario);
    return null;
}

const MODULO             = 'MSG_HANDLER';
const CONFIANZA_MINIMA   = 0.7;

// Intents que pertenecen al modulo de tareas
const INTENTS_TAREAS = new Set([
    'crear_tarea', 'buscar_tarea', 'modificar_tarea_fecha',
    'finalizar_tarea', 'cancelar_tarea',
    'buscar_tareas_retrasadas', 'resumen_tareas_semana'
]);

// Intents que pertenecen al modulo de reuniones
const INTENTS_REUNIONES = new Set([
    'crear_reunion', 'buscar_reunion', 'modificar_reunion_fecha',
    'cancelar_reunion', 'resumen_reuniones_semana', 'horarios_libres'
]);

// Intents que pertenecen al modulo de notas (Obsidian)
const INTENTS_NOTAS = new Set([
    'crear_nota', 'crear_nota_decision', 'crear_nota_dictado', 'buscar_nota'
]);

// Intents que pertenecen al modulo de correos
const INTENTS_CORREOS = new Set([
    'enviar_correo', 'buscar_correo', 'correos_pendientes'
]);

// ─────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────

async function identificarOperario(celular, lid = null) {
    try {
        const resp = await axios.get(`${API_BASE_URL}/api/bot/auth/identificar.php`, {
            params: { celular, lid }, headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000
        });
        return (resp.data?.success && resp.data?.data) ? resp.data.data : null;
    } catch (err) { logError(MODULO, 'Error identificando operario', err); return null; }
}

async function registrarLog(data) {
    try {
        await axios.post(`${API_BASE_URL}/api/bot/logs/registrar.php`, {
            cod_operario: data.codOperario, celular: data.celular, intent: data.intent,
            mensaje_entrada: data.mensajeEntrada, respuesta_bot: data.respuestaBot,
            exitoso: data.exitoso ? 1 : 0, error_detalle: data.errorDetalle || null,
            duracion_ms: data.duracionMs
        }, { headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000 });
    } catch (err) { logError(MODULO, 'Error registrando log', err); }
}

/**
 * Despacha el intent al handler correspondiente.
 * @returns {{ respuesta: string, subflow: object|null }}
 */
async function despacharIntent(intent, entidades, operario, subflowCtx = null, msgOriginal = null) {
    if (INTENTS_TAREAS.has(intent)) {
        return tareasHandler.ejecutar(intent, entidades, operario, subflowCtx);
    }
    if (INTENTS_REUNIONES.has(intent)) {
        return reunionesHandler.ejecutar(intent, entidades, operario, subflowCtx);
    }
    if (INTENTS_NOTAS.has(intent)) {
        return notasHandler.ejecutar(intent, entidades, operario);
    }
    if (INTENTS_CORREOS.has(intent)) {
        return correosHandler.ejecutar(intent, entidades, operario, subflowCtx, msgOriginal);
    }
    return { respuesta: `📝 La funcion *${intent}* estara disponible proximamente.`, subflow: null };
}

// ─────────────────────────────────────────────
//  Función principal
// ─────────────────────────────────────────────

async function procesarMensaje(cliente, msg) {
    const inicio = Date.now();

    if (esGrupo(msg.from) || msg.fromMe || msg.type !== 'chat') return;

    const jid    = msg.from;
    let celular  = normalizarNumero(jid);

    // Resolver LID si aplica
    if (jid.includes('@lid')) {
        try {
            const contact = await cliente.getContactById(jid);
            if (contact?.number) {
                log(MODULO, `🔍 Resolviendo LID ${jid} → PN: ${contact.number}`);
                celular = normalizarNumero(`${contact.number}@c.us`);
            }
        } catch (e) { log(MODULO, `⚠️ No se pudo resolver LID ${jid}: ${e.message}`); }
    }

    const textoRaw = (msg.body || '').trim();
    if (!textoRaw) return;

    log(MODULO, `📨 Mensaje de ${celular} (${jid}): "${textoRaw.slice(0, 80)}"`);

    const operario = await identificarOperario(celular, jid);
    if (!operario) {
        await enviarMensaje(cliente, jid, formatearNoRegistrado(), false);
        log(MODULO, `🚫 Número no registrado: ${celular}`);
        return;
    }

    const codOperario = operario.CodOperario;
    log(MODULO, `👤 Operario: ${operario.Nombre} ${operario.Apellido} (cod: ${codOperario})`);

    let respuestaFinal = '';
    let intentFinal    = 'desconocido';
    let exitoso        = true;
    let errorDetalle   = null;

    try {
        const estado = await obtenerEstado(celular);

        if (estado) {
            // Detectar si hay subflow activo leyendo datos_parciales
            const esSubflow = estado.datos_parciales?.subflow === 'seleccion_lista';

            if (esSubflow) {
                // ── Subflow: usuario elige de lista numerada ──
                const num = parseInt(textoRaw.trim(), 10);
                if (!isNaN(num) && num >= 1) {
                    intentFinal = estado.payload?.intentOriginal || estado.intent;
                    const ctx = {
                        subflow: 'seleccion_lista',
                        payload: estado.payload,
                        seleccionNumero: num
                    };
                    const { respuesta } = await despacharIntent(intentFinal, estado.payload?.entidades || {}, operario, ctx);
                    respuestaFinal = respuesta;
                    await borrarEstado(celular);
                    log(MODULO, `✅ Subflow ejecutado: selección #${num} para ${intentFinal}`);
                } else {
                    // No es número → empezar de nuevo
                    await borrarEstado(celular);
                    return clasificarYConfirmar(cliente, jid, celular, codOperario, operario, textoRaw, inicio);
                }

            } else {
                // ── Flujo normal: esperar sí/no ──
                const decision = evaluarRespuesta(textoRaw);
                log(MODULO, `🔄 Estado pendiente [${estado.intent}] → decisión: ${decision}`);

                if (decision === 'confirmar') {
                    intentFinal = estado.intent;
                    const { respuesta, subflow } = await despacharIntent(
                        intentFinal, estado.payload, operario, null, msg
                    );
                    respuestaFinal = respuesta;
                    await borrarEstado(celular);

                    // Si el handler devolvió un subflow, guardarlo para la próxima interacción
                    if (subflow) {
                        log(MODULO, `🔁 Guardando subflow: ${subflow.type}`);
                        await guardarEstado(
                            codOperario, celular,
                            subflow.type,
                            { intentOriginal: intentFinal, entidades: estado.payload, lista: subflow.payload?.lista || [] },
                            'Elige el número de la tarea de la lista.'
                        );
                        // Registrar el tipo de subflow en datos_parciales via un POST directo
                        await axios.post(
                            `${API_BASE_URL}/api/bot/confirmacion/guardar.php`,
                            {
                                cod_operario: codOperario, celular,
                                intent: subflow.type,
                                payload: { intentOriginal: intentFinal, entidades: estado.payload, lista: subflow.payload?.lista || [] },
                                frase: 'Selección de tarea pendiente.',
                                subflow: 'seleccion_lista'
                            },
                            { headers: { 'X-WSP-Token': WSP_TOKEN }, timeout: 8_000 }
                        );
                    }
                    log(MODULO, `✅ Acción ejecutada: ${intentFinal}`);

                } else if (decision === 'cancelar') {
                    intentFinal    = `cancelado_${estado.intent}`;
                    respuestaFinal = formatearCancelado();
                    await borrarEstado(celular);
                    log(MODULO, `🚫 Acción cancelada`);

                } else {
                    // Nuevo mensaje → descartar estado anterior y reclasificar
                    await borrarEstado(celular);
                    return clasificarYConfirmar(cliente, jid, celular, codOperario, operario, textoRaw, inicio);
                }
            }

        } else {
            return clasificarYConfirmar(cliente, jid, celular, codOperario, operario, textoRaw, inicio);
        }

    } catch (err) {
        logError(MODULO, 'Error procesando mensaje', err);
        respuestaFinal = formatearError();
        exitoso        = false;
        errorDetalle   = err.message;
    }

    await enviarMensaje(cliente, jid, respuestaFinal, false);
    await registrarLog({ codOperario, celular, intent: intentFinal, mensajeEntrada: textoRaw, respuestaBot: respuestaFinal, exitoso, errorDetalle, duracionMs: Date.now() - inicio });
}

async function clasificarYConfirmar(cliente, jid, celular, codOperario, operario, texto, inicio) {
    let respuestaFinal = '';
    let intentFinal    = 'desconocido';
    let exitoso        = true;
    let errorDetalle   = null;

    try {
        const clas = await clasificar(texto);
        intentFinal = clas.intent;
        log(MODULO, `🧠 Clasificación: intent=${clas.intent} conf=${clas.confianza} ambiguo=${clas.ambiguo}`);

        if (clas.confianza >= CONFIANZA_MINIMA && !clas.ambiguo && clas.intent !== 'desconocido') {

            // Para intents de cancelar/finalizar/modificar: buscar tarea primero
            const preConfirm = await prepararConfirmacion(clas.intent, clas.entidades, operario);

            if (preConfirm) {
                if (preConfirm.tipo === 'respuesta_directa') {
                    // No se encontro la tarea — responder directo sin guardar estado
                    respuestaFinal = preConfirm.respuesta;
                } else if (preConfirm.tipo === 'lista') {
                    // Multiples resultados — guardar subflow de seleccion
                    await guardarEstado(
                        codOperario, celular,
                        'seleccion_lista',
                        preConfirm.payloadSubflow,
                        'Selecciona el numero de la tarea.'
                    );
                    respuestaFinal = preConfirm.respuesta; // lista numerada
                } else {
                    // tipo === 'confirmar' — guardar estado con payload enriquecido (id real)
                    const ok = await guardarEstado(
                        codOperario, celular,
                        clas.intent,
                        preConfirm.payloadEnriquecido,
                        preConfirm.frase
                    );
                    if (ok) {
                        await enviarConfirmacion(cliente, jid, preConfirm.frase);
                    } else {
                        respuestaFinal = formatearError('No se pudo guardar la accion pendiente.');
                        exitoso = false;
                    }
                }
            } else {
                // Intent normal (crear_tarea, buscar, retrasadas, etc.) — usar frase de la IA
                const ok = await guardarEstado(codOperario, celular, clas.intent, clas.entidades, clas.frase_confirmacion);
                if (ok) {
                    await enviarConfirmacion(cliente, jid, clas.frase_confirmacion);
                } else {
                    respuestaFinal = formatearError('No se pudo guardar la accion pendiente.');
                    exitoso = false;
                }
            }
            log(MODULO, `💬 Confirmacion enviada para: ${intentFinal}`);
        } else {
            respuestaFinal = formatearNoEntendido();
            log(MODULO, `🤔 Confianza baja o ambiguo`);
        }
    } catch (err) {
        logError(MODULO, 'Error clasificando', err);
        respuestaFinal = formatearError();
        exitoso        = false;
        errorDetalle   = err.message;
    }


    // Solo enviar texto si no fue ya manejado por enviarConfirmacion (botones)
    if (respuestaFinal) {
        await enviarMensaje(cliente, jid, respuestaFinal, false);
    }
    await registrarLog({ codOperario, celular, intent: intentFinal, mensajeEntrada: texto, respuestaBot: respuestaFinal, exitoso, errorDetalle, duracionMs: Date.now() - inicio });
}

module.exports = { procesarMensaje };
