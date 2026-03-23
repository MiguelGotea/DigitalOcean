'use strict';

/**
 * tareasHandler.js — Ejecuta actions de tareas contra la API PHP
 *
 * Intents manejados:
 *  - crear_tarea
 *  - buscar_tarea
 *  - modificar_tarea_fecha
 *  - finalizar_tarea
 *  - cancelar_tarea
 *  - buscar_tareas_retrasadas
 *  - resumen_tareas_semana
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../../config/api');
const { log, logError } = require('../../utils/logger');
const {
    fmtTareaCreada,
    fmtListaTareas,
    fmtTareasRetrasadas,
    fmtResumenSemana,
    fmtTareaActualizada,
} = require('../formatters/tareasFormatter');

const MODULO = 'TAREAS_HANDLER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN };
const TIMEOUT = 10_000;

// Intents que requieren primero una búsqueda antes de actuar
const INTENTS_BUSCAR_PRIMERO = new Set([
    'finalizar_tarea', 'cancelar_tarea', 'modificar_tarea_fecha'
]);

/**
 * Determina si un intent de tareas requiere resolución antes de ejecutar.
 */
function requiereBusqueda(intent) {
    return INTENTS_BUSCAR_PRIMERO.has(intent);
}

/**
 * Llama a la API PHP con los parámetros dados.
 */
async function llamarApi(metodo, endpoint, params) {
    const url = `${API_BASE_URL}/api/bot/tareas/${endpoint}`;
    const cfg  = { headers: HEADERS, timeout: TIMEOUT };
    const resp = metodo === 'GET'
        ? await axios.get(url, { ...cfg, params })
        : await axios.post(url, params, cfg);
    return resp.data;
}

/**
 * Ejecuta un intent sobre una tarea ya identificada (id conocido).
 */
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

    return `⚠️ Intent no ejecutable sobre tarea: ${intent}`;
}

/**
 * Función principal: ejecuta un intent de tarea.
 * @param {string} intent
 * @param {object} entidades   Extraídas por el clasificador IA
 * @param {object} operario    Datos del operario identificado
 * @param {object|null} estadoPendiente  Si viene de un subflow (selección de lista)
 * @returns {{ respuesta: string, subflow: object|null }}
 *   subflow: si no es null, indica que hay una selección pendiente
 */
async function ejecutar(intent, entidades, operario, estadoPendiente = null) {
    log(MODULO, `▶ Ejecutando intent: ${intent}`);

    try {
        // ── SUBFLOW: usuario eligió número de lista ──────────────────────────
        if (estadoPendiente?.subflow === 'seleccion_lista') {
            const { intent: intentOriginal, entidades: entOriginal, lista } = estadoPendiente.payload;
            const seleccion = parseInt(estadoPendiente.seleccionNumero, 10);

            if (!seleccion || seleccion < 1 || seleccion > lista.length) {
                return {
                    respuesta: `❌ Número inválido. Responde con un número entre 1 y ${lista.length}.`,
                    subflow: null
                };
            }

            const tareaElegida = lista[seleccion - 1];
            log(MODULO, `📌 Tarea seleccionada: #${tareaElegida.id} "${tareaElegida.titulo}"`);

            const respuesta = await ejecutarSobreTarea(intentOriginal, tareaElegida.id, entOriginal, operario);
            return { respuesta, subflow: null };
        }

        // ── CREAR TAREA ───────────────────────────────────────────────────────
        if (intent === 'crear_tarea') {
            const r = await llamarApi('POST', 'crear.php', {
                cod_operario: operario.CodOperario,
                cod_cargo:    operario.CodNivelesCargos || null,
                titulo:       entidades?.titulo  || 'Tarea sin título',
                descripcion:  entidades?.descripcion || null,
                fecha_meta:   entidades?.fecha || null,
                prioridad:    entidades?.prioridad || 'media',
            });
            return {
                respuesta: r.success ? fmtTareaCreada(r.data) : `❌ ${r.message}`,
                subflow: null
            };
        }

        // ── BUSCAR TAREA (para consulta directa) ─────────────────────────────
        if (intent === 'buscar_tarea') {
            const r = await llamarApi('POST', 'buscar.php', {
                cod_operario:  operario.CodOperario,
                palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
            });
            if (!r.success) return { respuesta: `❌ ${r.message}`, subflow: null };
            if (r.total === 0) return { respuesta: `🔍 No encontré tareas con esa búsqueda.`, subflow: null };
            if (r.demasiados) return { respuesta: `🔍 Hay demasiados resultados. Sé más específico.`, subflow: null };
            return { respuesta: fmtListaTareas(r.data), subflow: null };
        }

        // ── INTENTS QUE REQUIEREN BÚSQUEDA PREVIA ────────────────────────────
        if (requiereBusqueda(intent)) {
            const r = await llamarApi('POST', 'buscar.php', {
                cod_operario:   operario.CodOperario,
                palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
            });

            if (!r.success)    return { respuesta: `❌ ${r.message}`, subflow: null };
            if (r.total === 0) return { respuesta: `🔍 No encontré tareas que coincidan. Intenta con otras palabras.`, subflow: null };
            if (r.demasiados)  return { respuesta: `🔍 Hay muchos resultados, sé más específico.`, subflow: null };

            // Un solo resultado → ejecutar directamente
            if (r.total === 1) {
                const respuesta = await ejecutarSobreTarea(intent, r.data[0].id, entidades, operario);
                return { respuesta, subflow: null };
            }

            // Múltiples resultados → guardar lista y pedir selección
            const accionTexto = {
                'finalizar_tarea':      'finalizar',
                'cancelar_tarea':       'cancelar',
                'modificar_tarea_fecha':'modificar la fecha',
            }[intent] || 'ejecutar la acción';

            return {
                respuesta: fmtListaTareas(r.data, accionTexto),
                subflow: {
                    type:  'seleccion_lista',
                    intent: intent,
                    payload: {
                        intentOriginal: intent,
                        entidades,
                        lista: r.data
                    }
                }
            };
        }

        // ── TAREAS RETRASADAS ─────────────────────────────────────────────────
        if (intent === 'buscar_tareas_retrasadas') {
            const r = await llamarApi('GET', 'retrasadas.php', { cod_operario: operario.CodOperario });
            return {
                respuesta: r.success ? fmtTareasRetrasadas(r.data) : `❌ ${r.message}`,
                subflow: null
            };
        }

        // ── RESUMEN SEMANA ────────────────────────────────────────────────────
        if (intent === 'resumen_tareas_semana') {
            const r = await llamarApi('GET', 'resumen_semana.php', { cod_operario: operario.CodOperario });
            return {
                respuesta: r.success ? fmtResumenSemana(r.data) : `❌ ${r.message}`,
                subflow: null
            };
        }

        return { respuesta: `⚠️ Intent de tarea no reconocido: ${intent}`, subflow: null };

    } catch (err) {
        logError(MODULO, `Error ejecutando ${intent}`, err);
        return { respuesta: `⚠️ Ocurrió un error al ejecutar la acción. Inténtalo de nuevo.`, subflow: null };
    }
}

module.exports = { ejecutar, requiereBusqueda };
