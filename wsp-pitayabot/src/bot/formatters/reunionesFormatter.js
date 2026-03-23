'use strict';

/**
 * reunionesFormatter.js — Mensajes WhatsApp del modulo de reuniones
 */

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'sin fecha';
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-NI', {
        weekday: 'long', day: 'numeric', month: 'long',
        timeZone: 'America/Managua'
    });
}

function formatearHora(hora) {
    if (!hora) return '';
    const [h, min] = hora.split(':').map(Number);
    const ampm  = h >= 12 ? 'PM' : 'AM';
    const h12   = h % 12 || 12;
    return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

function fmtReunionCreada(data) {
    const fecha   = formatearFecha(data.fecha);
    const hora    = formatearHora(data.hora);
    const partes  = (data.enviados || []).map(n => `  • ${n}`).join('\n');
    const dur     = data.duracion_min || 60;
    const lugar   = data.lugar || 'Presencial';
    return [
        `✅ *Reunion creada*`,
        `📌 *${data.titulo}*`,
        `📅 ${fecha} a las ${hora}`,
        `⏱ Duracion: ${dur} min | 📍 ${lugar}`,
        partes ? `👥 Invitaciones enviadas a:\n${partes}` : '',
        `📧 Los participantes recibiran el ICS en su correo.`
    ].filter(Boolean).join('\n');
}

function fmtListaReuniones(reuniones) {
    if (!reuniones.length) return '📅 No hay reuniones programadas.';
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
    const lineas = reuniones.map((r, i) => {
        const fecha = formatearFecha(r.fecha_meta);
        const hora  = formatearHora(r.hora_inicio);
        const partes = r.participantes_nombres ? ` (con: ${r.participantes_nombres})` : '';
        return `${emojis[i] || `${i+1}.`} *${r.titulo}*\n   📅 ${fecha} ${hora ? `a las ${hora}` : ''}${partes}`;
    });
    return `📅 *Reuniones encontradas:*\n\n${lineas.join('\n\n')}`;
}

function fmtResumenSemana(reuniones) {
    if (!reuniones.length) return `📅 No tienes reuniones esta semana.`;
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
    const lineas = reuniones.map((r, i) => {
        const hora   = formatearHora(r.hora_inicio);
        const partes = r.participantes_nombres ? ` con ${r.participantes_nombres}` : '';
        const dias   = parseInt(r.dias_restantes);
        let cuando = dias === 0 ? '📍 *HOY*' : dias === 1 ? '📍 *Manana*' : `📅 ${formatearFecha(r.fecha_meta)}`;
        return `${emojis[i] || `${i+1}.`} ${cuando} ${hora ? `— ${hora}` : ''}\n   📌 ${r.titulo}${partes}`;
    });
    return `📋 *Reuniones esta semana* (${reuniones.length})\n\n${lineas.join('\n\n')}`;
}

function fmtHorariosLibres(reuniones, fecha) {
    const fechaFmt = formatearFecha(fecha);

    if (!reuniones.length) {
        return `🕐 *Horarios libres el ${fechaFmt}*\nNo tienes reuniones ese dia. Estas libre todo el dia.`;
    }

    // Calcular huecos entre 07:00 y 19:00
    const INICIO_DIA = 7 * 60;
    const FIN_DIA    = 19 * 60;

    const bloques = reuniones.map(r => {
        const [h, m] = (r.hora_inicio_fmt || '09:00').split(':').map(Number);
        const inicio = h * 60 + m;
        const fin    = inicio + (parseInt(r.duracion_min) || 60);
        return { inicio, fin, titulo: r.titulo };
    }).sort((a, b) => a.inicio - b.inicio);

    const lineasOcupadas = reuniones.map(r =>
        `  • ${r.hora_inicio_fmt} - ${r.hora_fin_fmt} → ${r.titulo}`
    );

    // Calcular huecos
    const libres = [];
    let cursor = INICIO_DIA;
    for (const b of bloques) {
        if (b.inicio > cursor) {
            libres.push(`  ✅ ${minsToHora(cursor)} - ${minsToHora(b.inicio)} (${b.inicio - cursor} min)`);
        }
        cursor = Math.max(cursor, b.fin);
    }
    if (cursor < FIN_DIA) {
        libres.push(`  ✅ ${minsToHora(cursor)} en adelante`);
    }

    return [
        `🕐 *Horarios libres el ${fechaFmt}*`,
        `Reuniones ese dia:`,
        ...lineasOcupadas,
        '',
        `Espacios libres:`,
        ...(libres.length ? libres : ['  (No hay huecos disponibles entre 7am y 7pm)'])
    ].join('\n');
}

function minsToHora(mins) {
    const h   = Math.floor(mins / 60);
    const m   = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtConfirmacionReunion(reunion) {
    const fecha = formatearFecha(reunion.fecha_meta);
    const hora  = formatearHora(reunion.hora_inicio);
    const partes = reunion.participantes_nombres || 'sin participantes registrados';
    return `Vas a *CANCELAR* la siguiente reunion:\n\n📌 *${reunion.titulo}*\n📅 ${fecha}${hora ? ` a las ${hora}` : ''}\n👥 ${partes}`;
}

module.exports = {
    fmtReunionCreada, fmtListaReuniones, fmtResumenSemana,
    fmtHorariosLibres, fmtConfirmacionReunion, formatearFecha, formatearHora
};
