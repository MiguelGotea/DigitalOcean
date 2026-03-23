'use strict';

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../../config/api');
const { log, logError } = require('../../utils/logger');
const {
    fmtTareaCreada, fmtListaTareas, fmtTareasRetrasadas,
    fmtResumenSemana, fmtTareaActualizada,
} = require('../formatters/tareasFormatter');

const MODULO  = 'TAREAS_HANDLER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN };
const TIMEOUT = 10_000;

const INTENTS_BUSCAR_PRIMERO = new Set([
    'finalizar_tarea', 'cancelar_tarea', 'modificar_tarea_fecha'
]);

function requiereBusqueda(intent) {
    return INTENTS_BUSCAR_PRIMERO.has(intent);
}

async function llamarApi(metodo, endpoint, params) {
    const url  = `${API_BASE_URL}/api/bot/tareas/${endpoint}`;
    const cfg  = { headers: HEADERS, timeout: TIMEOUT };
    const resp = metodo === 'GET'
        ? await axios.get(url, { ...cfg, params })
        : await axios.post(url, params, cfg);
    return resp.data;
}

function fmtFechaCorta(fechaStr) {
    if (!fechaStr) return 'sin fecha limite';
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-NI', {
        day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'America/Managua'
    });
}

/**
 * Busca la tarea ANTES de mostrar la confirmacion con nombre y fecha real.
 * Solo aplica para intents finalizar/cancelar/modificar.
 *
 * @returns {{ tipo: 'confirmar', frase, payloadEnriquecido }
 *          | { tipo: 'respuesta_directa', respuesta }
 *          | { tipo: 'lista', respuesta, payloadSubflow }
 *          | null }
 */
async function prepararConfirmacion(intent, entidades, operario) {
    if (!requiereBusqueda(intent)) return null;

    try {
        const r = await llamarApi('POST', 'buscar.php', {
            cod_operario:   operario.CodOperario,
            palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
        });

        if (!r.success)    return { tipo: 'respuesta_directa', respuesta: `❌ ${r.message}` };
        if (r.total === 0) return { tipo: 'respuesta_directa', respuesta: `🔍 No encontre tareas con ese nombre. Prueba con otras palabras.` };
        if (r.demasiados)  return { tipo: 'respuesta_directa', respuesta: `🔍 Hay muchos resultados, se mas especifico.` };

        const accionTexto = {
            'finalizar_tarea':       'FINALIZAR',
            'cancelar_tarea':        'CANCELAR',
            'modificar_tarea_fecha': 'CAMBIAR FECHA de',
        }[intent] || 'actuar sobre';

        if (r.total === 1) {
            const tarea = r.data[0];
            const frase = `Vas a *${accionTexto}* la siguiente tarea:\n\n📋 *${tarea.titulo}*\n📅 Fecha limite: ${fmtFechaCorta(tarea.fecha_meta)}`;
            return {
                tipo: 'confirmar',
                frase,
                payloadEnriquecido: { ...entidades, _id_tarea: tarea.id, _titulo: tarea.titulo }
            };
        }

        // 2-5 resultados → lista directa sin guardar estado
        const accionMin = { 'finalizar_tarea': 'finalizar', 'cancelar_tarea': 'cancelar', 'modificar_tarea_fecha': 'modificar' }[intent] || 'actuar';
        return {
            tipo: 'lista',
            respuesta: fmtListaTareas(r.data, accionMin),
            payloadSubflow: { intentOriginal: intent, entidades, lista: r.data }
        };

    } catch (err) {
        logError(MODULO, 'Error en prepararConfirmacion', err);
        return { tipo: 'respuesta_directa', respuesta: `⚠️ Ocurrio un error buscando la tarea.` };
    }
}

async function ejecutarSobreTarea(intent, idTarea, entidades, operario) {
    const base = { cod_operario: operario.CodOperario, id_tarea: idTarea };
    if (intent === 'finalizar_tarea') {
        const r = await llamarApi('POST', 'cambiar_estado.php', { ...base, estado_destino: 'finalizado' });
        return r.success ? fmtTareaActualizada(r.message) : `❌ ${r.message}`;
    }
    if (intent === 'cancelar_tarea') {
        const r = await llamarApi('POST', 'cambiar_estado.php', { ...base, estado_destino: 'cancelado' });
        return r.success ? fmtTareaActualizada(r.message) : `❌ ${r.message}`;
    }
    if (intent === 'modificar_tarea_fecha') {
        const r = await llamarApi('POST', 'modificar.php', { ...base, fecha_meta: entidades?.fecha });
        return r.success ? fmtTareaActualizada(r.message) : `❌ ${r.message}`;
    }
    return `⚠️ Intent no ejecutable: ${intent}`;
}

async function ejecutar(intent, entidades, operario, estadoPendiente = null) {
    log(MODULO, `▶ Ejecutando intent: ${intent}`);

    try {
        // ── SUBFLOW: usuario eligio numero de lista ──
        if (estadoPendiente?.subflow === 'seleccion_lista') {
            const { lista }  = estadoPendiente.payload;
            const seleccion  = parseInt(estadoPendiente.seleccionNumero, 10);
            const intentOrig = estadoPendiente.payload?.intentOriginal || intent;
            if (!seleccion || seleccion < 1 || seleccion > lista.length) {
                return { respuesta: `❌ Numero invalido. Responde entre 1 y ${lista.length}.`, subflow: null };
            }
            const tareaElegida = lista[seleccion - 1];
            log(MODULO, `📌 Tarea seleccionada: #${tareaElegida.id} "${tareaElegida.titulo}"`);
            const respuesta = await ejecutarSobreTarea(intentOrig, tareaElegida.id, estadoPendiente.payload?.entidades || entidades, operario);
            return { respuesta, subflow: null };
        }

        // ── CREAR TAREA ──
        if (intent === 'crear_tarea') {
            const r = await llamarApi('POST', 'crear.php', {
                cod_operario: operario.CodOperario,
                cod_cargo:    operario.CodNivelesCargos || null,
                titulo:       entidades?.titulo  || 'Tarea sin titulo',
                descripcion:  entidades?.descripcion || null,
                fecha_meta:   entidades?.fecha || null,
                prioridad:    entidades?.prioridad || 'media',
            });
            return { respuesta: r.success ? fmtTareaCreada(r.data) : `❌ ${r.message}`, subflow: null };
        }

        // ── BUSCAR TAREA (consulta directa) ──
        if (intent === 'buscar_tarea') {
            const r = await llamarApi('POST', 'buscar.php', {
                cod_operario:   operario.CodOperario,
                palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
            });
            if (!r.success)    return { respuesta: `❌ ${r.message}`, subflow: null };
            if (r.total === 0) return { respuesta: `🔍 No encontre tareas con esa busqueda.`, subflow: null };
            if (r.demasiados)  return { respuesta: `🔍 Demasiados resultados, se mas especifico.`, subflow: null };
            return { respuesta: fmtListaTareas(r.data), subflow: null };
        }

        // ── FINALIZAR / CANCELAR / MODIFICAR ──
        if (requiereBusqueda(intent)) {
            const idTarea = entidades?._id_tarea;
            if (idTarea) {
                // Ya viene enriquecido de prepararConfirmacion — ejecutar directo
                const respuesta = await ejecutarSobreTarea(intent, idTarea, entidades, operario);
                return { respuesta, subflow: null };
            }
            // Fallback: buscar en tiempo de ejecucion
            const r = await llamarApi('POST', 'buscar.php', {
                cod_operario:   operario.CodOperario,
                palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
            });
            if (!r.success)    return { respuesta: `❌ ${r.message}`, subflow: null };
            if (r.total === 0) return { respuesta: `🔍 No encontre tareas que coincidan.`, subflow: null };
            if (r.demasiados)  return { respuesta: `🔍 Hay muchos resultados, se mas especifico.`, subflow: null };
            if (r.total === 1) {
                const respuesta = await ejecutarSobreTarea(intent, r.data[0].id, entidades, operario);
                return { respuesta, subflow: null };
            }
            const accionMin = { 'finalizar_tarea': 'finalizar', 'cancelar_tarea': 'cancelar', 'modificar_tarea_fecha': 'modificar' }[intent] || 'actuar';
            return {
                respuesta: fmtListaTareas(r.data, accionMin),
                subflow: { type: 'seleccion_lista', payload: { intentOriginal: intent, entidades, lista: r.data } }
            };
        }

        // ── RETRASADAS ──
        if (intent === 'buscar_tareas_retrasadas') {
            const r = await llamarApi('GET', 'retrasadas.php', { cod_operario: operario.CodOperario });
            return { respuesta: r.success ? fmtTareasRetrasadas(r.data) : `❌ ${r.message}`, subflow: null };
        }

        // ── RESUMEN SEMANA ──
        if (intent === 'resumen_tareas_semana') {
            const r = await llamarApi('GET', 'resumen_semana.php', { cod_operario: operario.CodOperario });
            return { respuesta: r.success ? fmtResumenSemana(r.data) : `❌ ${r.message}`, subflow: null };
        }

        return { respuesta: `⚠️ Intent no reconocido: ${intent}`, subflow: null };

    } catch (err) {
        logError(MODULO, `Error ejecutando ${intent}`, err);
        return { respuesta: `⚠️ Ocurrio un error. Intentalo de nuevo.`, subflow: null };
    }
}

module.exports = { ejecutar, requiereBusqueda, prepararConfirmacion };
