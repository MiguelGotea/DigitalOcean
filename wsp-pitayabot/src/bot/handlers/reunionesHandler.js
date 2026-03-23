'use strict';

/**
 * reunionesHandler.js — Router de intents del modulo de reuniones
 *
 * Intents manejados:
 *  crear_reunion, buscar_reunion, modificar_reunion_fecha,
 *  cancelar_reunion, resumen_reuniones_semana, horarios_libres
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../../config/api');
const { log, logError }           = require('../../utils/logger');
const {
    fmtReunionCreada, fmtListaReuniones, fmtResumenSemana,
    fmtHorariosLibres, fmtConfirmacionReunion, formatearFecha, formatearHora
} = require('../formatters/reunionesFormatter');

const MODULO  = 'REUNIONES_HANDLER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN };
const TIMEOUT = 12_000;

const INTENTS_BUSCAR_PRIMERO = new Set(['cancelar_reunion', 'modificar_reunion_fecha']);

async function llamarApi(metodo, endpoint, params) {
    const url  = `${API_BASE_URL}/api/bot/reuniones/${endpoint}`;
    const cfg  = { headers: HEADERS, timeout: TIMEOUT };
    const resp = metodo === 'GET'
        ? await axios.get(url, { ...cfg, params })
        : await axios.post(url, params, cfg);
    return resp.data;
}

async function llamarApiOps(metodo, endpoint, params) {
    const url  = `${API_BASE_URL}/api/bot/operarios/${endpoint}`;
    const cfg  = { headers: HEADERS, timeout: TIMEOUT };
    const resp = metodo === 'GET'
        ? await axios.get(url, { ...cfg, params })
        : await axios.post(url, params, cfg);
    return resp.data;
}

/**
 * Busca participantes por nombre. Devuelve resultado listo para usar o mensaje de ambiguedad (Opcion B).
 * Si hay ambiguedad, el bot pedira el nombre completo exacto.
 */
async function resolverParticipante(nombre) {
    const r = await llamarApiOps('GET', 'buscar_participantes.php', { nombre });
    if (!r.success || r.total === 0) return { ok: false, mensaje: `No encontre a ningun operario llamado "${nombre}".` };
    if (r.demasiados) return { ok: false, mensaje: `Hay muchos operarios con "${nombre}". Se mas especifico.` };
    if (r.total === 1) return { ok: true, participante: r.data[0] };

    // Opcion B: mostrar lista y pedir nombre completo
    const lista = r.data.map((p, i) => {
        const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
        return `${emojis[i] || `${i+1}.`} ${p.nombre_completo} (${p.cargo})`;
    }).join('\n');
    return {
        ok: false,
        esAmbiguo: true,
        mensaje: `Para "${nombre}" encontre varios:\n${lista}\n\nEscribe el *nombre completo exacto* del que quieres invitar.`
    };
}

/**
 * Pre-busqueda para cancelar/modificar: busca la reunion antes de confirmar.
 */
async function prepararConfirmacion(intent, entidades, operario) {
    if (!INTENTS_BUSCAR_PRIMERO.has(intent)) return null;

    try {
        const r = await llamarApi('POST', 'buscar.php', {
            cod_operario:   operario.CodOperario,
            palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
        });

        if (!r.success)    return { tipo: 'respuesta_directa', respuesta: `❌ ${r.message}` };
        if (r.total === 0) return { tipo: 'respuesta_directa', respuesta: `🔍 No encontre ninguna reunion con ese nombre. Prueba con otras palabras.` };
        if (r.demasiados)  return { tipo: 'respuesta_directa', respuesta: `🔍 Hay muchos resultados, se mas especifico.` };

        const accion = intent === 'cancelar_reunion' ? 'CANCELAR' : 'CAMBIAR FECHA de';

        if (r.total === 1) {
            const reunion = r.data[0];
            const frase   = fmtConfirmacionReunion(reunion).replace('CANCELAR', accion);
            return {
                tipo: 'confirmar',
                frase,
                payloadEnriquecido: { ...entidades, _id_reunion: reunion.id, _titulo: reunion.titulo }
            };
        }

        return {
            tipo: 'lista',
            respuesta: fmtListaReuniones(r.data),
            payloadSubflow: { intentOriginal: intent, entidades, lista: r.data }
        };

    } catch (err) {
        logError(MODULO, 'Error en prepararConfirmacion', err);
        return { tipo: 'respuesta_directa', respuesta: `⚠️ Error buscando la reunion.` };
    }
}

async function ejecutar(intent, entidades, operario, estadoPendiente = null) {
    log(MODULO, `▶ Ejecutando intent: ${intent}`);

    try {
        // ── SUBFLOW: seleccion de lista ──
        if (estadoPendiente?.subflow === 'seleccion_lista') {
            const { lista } = estadoPendiente.payload;
            const seleccion  = parseInt(estadoPendiente.seleccionNumero, 10);
            const intentOrig = estadoPendiente.payload?.intentOriginal || intent;
            if (!seleccion || seleccion < 1 || seleccion > lista.length) {
                return { respuesta: `❌ Numero invalido. Responde entre 1 y ${lista.length}.`, subflow: null };
            }
            const reunion = lista[seleccion - 1];
            // Una vez elegida, ejecutar directamente
            return ejecutar(intentOrig, { ...estadoPendiente.payload?.entidades, _id_reunion: reunion.id }, operario, null);
        }

        // ── CREAR REUNION ──
        if (intent === 'crear_reunion') {
            // Resolver participantes (Opcion B: si hay ambiguedad, informar directamente)
            const nombresRaw = entidades?.participantes || [];
            const participantesResueltos = [];
            const mensajesAmbiguedad     = [];

            for (const nombre of nombresRaw) {
                const res = await resolverParticipante(nombre);
                if (res.ok) {
                    participantesResueltos.push(res.participante);
                } else if (res.esAmbiguo) {
                    mensajesAmbiguedad.push(res.mensaje);
                } else {
                    mensajesAmbiguedad.push(res.mensaje);
                }
            }

            if (mensajesAmbiguedad.length) {
                return {
                    respuesta: `⚠️ No pude identificar a todos los participantes:\n\n${mensajesAmbiguedad.join('\n\n')}\n\nVuelve a indicar la reunion con los nombres completos.`,
                    subflow: null
                };
            }

            const r = await llamarApi('POST', 'crear.php', {
                cod_operario: operario.CodOperario,
                titulo:       entidades?.titulo || 'Reunion',
                descripcion:  entidades?.descripcion || null,
                fecha:        entidades?.fecha || null,
                hora:         entidades?.hora  || '09:00',
                duracion_min: entidades?.duracion_min || 60,
                lugar:        entidades?.lugar || 'Presencial',
                participantes: participantesResueltos,
            });

            return {
                respuesta: r.success ? fmtReunionCreada({ ...r.data, titulo: entidades?.titulo }) : `❌ ${r.message}`,
                subflow: null
            };
        }

        // ── BUSCAR REUNION ──
        if (intent === 'buscar_reunion') {
            const r = await llamarApi('POST', 'buscar.php', {
                cod_operario:   operario.CodOperario,
                palabras_clave: entidades?.palabras_clave || entidades?.titulo || '',
                fecha:          entidades?.fecha || null,
            });
            if (!r.success)    return { respuesta: `❌ ${r.message}`, subflow: null };
            if (r.total === 0) return { respuesta: `🔍 No encontre reuniones que coincidan.`, subflow: null };
            return { respuesta: fmtListaReuniones(r.data), subflow: null };
        }

        // ── CANCELAR / MODIFICAR REUNION (con id ya conocido) ──
        if (intent === 'cancelar_reunion' || intent === 'modificar_reunion_fecha') {
            const idReunion = entidades?._id_reunion;
            if (!idReunion) {
                return { respuesta: `⚠️ No se pudo identificar la reunion a modificar.`, subflow: null };
            }

            if (intent === 'cancelar_reunion') {
                const r = await llamarApi('POST', 'cancelar.php', {
                    cod_operario: operario.CodOperario,
                    id_reunion:   idReunion,
                });
                return { respuesta: r.success ? `✅ *PitayaBot*\n\n${r.message}` : `❌ ${r.message}`, subflow: null };
            }

            if (intent === 'modificar_reunion_fecha') {
                const r = await llamarApi('POST', 'modificar_fecha.php', {
                    cod_operario: operario.CodOperario,
                    id_reunion:   idReunion,
                    nueva_fecha:  entidades?.fecha,
                    nueva_hora:   entidades?.hora || null,
                });
                return { respuesta: r.success ? `✅ *PitayaBot*\n\n${r.message}` : `❌ ${r.message}`, subflow: null };
            }
        }

        // ── RESUMEN SEMANAL ──
        if (intent === 'resumen_reuniones_semana') {
            const r = await llamarApi('GET', 'resumen_semana.php', { cod_operario: operario.CodOperario });
            return { respuesta: r.success ? fmtResumenSemana(r.data) : `❌ ${r.message}`, subflow: null };
        }

        // ── HORARIOS LIBRES ──
        if (intent === 'horarios_libres') {
            const fecha = entidades?.fecha;
            if (!fecha) return { respuesta: `❌ Indica para que fecha quieres ver tus horarios libres.`, subflow: null };
            const r = await llamarApi('GET', 'horarios_libres.php', {
                cod_operario: operario.CodOperario,
                fecha,
            });
            return { respuesta: r.success ? fmtHorariosLibres(r.data, fecha) : `❌ ${r.message}`, subflow: null };
        }

        return { respuesta: `⚠️ Intent de reunion no reconocido: ${intent}`, subflow: null };

    } catch (err) {
        logError(MODULO, `Error ejecutando ${intent}`, err);
        return { respuesta: `⚠️ Ocurrio un error ejecutando la accion. Intentalo de nuevo.`, subflow: null };
    }
}

module.exports = { ejecutar, prepararConfirmacion };
