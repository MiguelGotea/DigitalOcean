'use strict';

/**
 * tareasFormatter.js — Formatea respuestas del módulo de tareas al estilo WhatsApp
 */

/**
 * Formatea fecha a español legible (ej: "lunes 25 de marzo")
 */
function formatearFecha(fechaStr) {
    if (!fechaStr) return 'Sin fecha límite';
    const [y, m, d] = fechaStr.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-NI', {
        weekday: 'long', day: 'numeric', month: 'long',
        timeZone: 'America/Managua'
    });
}

/**
 * Devuelve emoji de prioridad
 */
function emojiPrioridad(prioridad) {
    return { alta: '🔴', media: '🟡', baja: '🟢' }[prioridad] || '⚪';
}

/**
 * Mensaje de confirmación de tarea creada
 */
function fmtTareaCreada(data) {
    const fecha = formatearFecha(data.fecha_meta);
    const pri   = emojiPrioridad(data.prioridad);
    return `✅ *Tarea creada*\n📋 *${data.titulo}*\n📅 Fecha límite: ${fecha}\n${pri} Prioridad: ${data.prioridad}\n🆔 ID: #${data.id}`;
}

/**
 * Mensaje de lista de tareas numerada (búsqueda ambigua)
 */
function fmtListaTareas(tareas, accionPendiente = '') {
    const lineas = tareas.map((t, i) => {
        const emojisNum = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
        const fecha     = t.fecha_meta ? ` (vence ${formatearFecha(t.fecha_meta)})` : '';
        return `${emojisNum[i] || `${i+1}.`} ${t.titulo}${fecha}`;
    });
    const accion = accionPendiente ? `\n\n_¿Sobre cuál quieres ${accionPendiente}?_` : '';
    return `🔍 *Encontré varias tareas:*\n\n${lineas.join('\n')}${accion}\n\nResponde con el *número* de la tarea.`;
}

/**
 * Mensaje de tareas retrasadas
 */
function fmtTareasRetrasadas(tareas) {
    if (!tareas.length) return `🎉 *¡Sin retrasos!* No tienes tareas vencidas.`;

    const lineas = tareas.map((t, i) => {
        const emojisNum = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
        const dias = t.dias_retraso === 1 ? 'hace 1 día' : `hace ${t.dias_retraso} días`;
        return `${emojisNum[i] || `${i+1}.`} ${t.titulo} → venció ${dias} (${t.fecha_meta})`;
    });
    return `⚠️ *Tareas retrasadas*\nTienes ${tareas.length} tarea(s) vencida(s):\n\n${lineas.join('\n')}`;
}

/**
 * Mensaje de resumen de tareas de la semana
 */
function fmtResumenSemana(tareas) {
    if (!tareas.length) return `📅 *Esta semana* no tienes tareas con vencimiento programado.`;

    const lineas = tareas.map((t, i) => {
        const emojisNum = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
        let cuando = '';
        if (t.dias_restantes == 0)     cuando = 'vence *hoy*';
        else if (t.dias_restantes == 1) cuando = 'vence *mañana*';
        else                            cuando = `vence el ${formatearFecha(t.fecha_meta)}`;
        return `${emojisNum[i] || `${i+1}.`} ${t.titulo} → ${cuando}`;
    });
    return `📋 *Tareas de esta semana*\nTienes ${tareas.length} tarea(s) próximas:\n\n${lineas.join('\n')}`;
}

/**
 * Mensaje de tarea modificada o estado cambiado
 */
function fmtTareaActualizada(message) {
    return `✅ *PitayaBot*\n\n${message}`;
}

module.exports = {
    fmtTareaCreada,
    fmtListaTareas,
    fmtTareasRetrasadas,
    fmtResumenSemana,
    fmtTareaActualizada,
};
