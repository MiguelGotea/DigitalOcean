'use strict';

/**
 * preClassifier.js — Clasificador local instantáneo por regex (Solución 2)
 *
 * Para frases comunes y claras, clasifica el intent sin llamar a ninguna IA.
 * Solo devuelve resultado cuando la confianza es ≥ 0.97 (certeza casi absoluta).
 * Si no hay match, retorna null → el flujo cae al clasificador con LLM.
 *
 * Extrae además entidades básicas: título, fecha, palabras_clave.
 */

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

const MESES = {
    enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
    julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12
};

function ahora() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Managua' }));
}

function formatFecha(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

/**
 * Extrae una fecha del texto en español.
 * Soporta: "hoy", "mañana", "pasado mañana", "el lunes", "15 de marzo", "15/03/2025"
 * @returns {string|null} YYYY-MM-DD o null
 */
function extraerFecha(texto) {
    const t = texto.toLowerCase();
    const hoy = ahora();

    if (/\bhoy\b/.test(t)) return formatFecha(hoy);

    if (/\bma[nñ]ana\b/.test(t) && !/pasado/.test(t)) {
        const d = new Date(hoy); d.setDate(d.getDate() + 1); return formatFecha(d);
    }

    if (/pasado\s+ma[nñ]ana/.test(t)) {
        const d = new Date(hoy); d.setDate(d.getDate() + 2); return formatFecha(d);
    }

    // "el lunes", "este viernes"
    const diasSemana = {
        lunes:1, martes:2, miercoles:3, miercoles:3, jueves:4,
        viernes:5, sabado:6, domingo:0
    };
    for (const [nombre, target] of Object.entries(diasSemana)) {
        if (new RegExp(`\\b${nombre}\\b`).test(t)) {
            const d = new Date(hoy);
            const actual = d.getDay();
            let diff = target - actual;
            if (diff <= 0) diff += 7;
            d.setDate(d.getDate() + diff);
            return formatFecha(d);
        }
    }

    // "15 de marzo" / "15 de marzo de 2025"
    const mMatch = t.match(/(\d{1,2})\s+de\s+([a-z\u00e0-\u00ff]+)(?:\s+de\s+(\d{4}))?/);
    if (mMatch) {
        const mes = MESES[mMatch[2]];
        if (mes) {
            const anio = parseInt(mMatch[3] || hoy.getFullYear(), 10);
            const d    = new Date(anio, mes - 1, parseInt(mMatch[1], 10));
            return formatFecha(d);
        }
    }

    // "15/03" o "15/03/2025"
    const dMatch = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (dMatch) {
        const anio = parseInt(dMatch[3] || hoy.getFullYear(), 10);
        const d    = new Date(anio, parseInt(dMatch[2], 10) - 1, parseInt(dMatch[1], 10));
        return formatFecha(d);
    }

    return null;
}

/**
 * Extrae el título/descripción eliminando palabras clave del intent y expresiones de fecha.
 */
function extraerTitulo(texto, patronesAEliminar) {
    let limpio = texto;
    for (const p of patronesAEliminar) {
        limpio = limpio.replace(p, '');
    }
    limpio = limpio
        .replace(/\bcon\s+fecha\s+(l[ií]mite\s+)?(hoy|ma[nñ]ana|pasado\s+ma[nñ]ana|\d{1,2}\s+de\s+\w+|\d{1,2}\/\d{1,2}(?:\/\d{4})?|\w+)/gi, '')
        .replace(/\bpara\s+(hoy|ma[nñ]ana|el\s+\w+|\d{1,2}\/\d{1,2})/gi, '')
        .replace(/\bfecha\s+l[ií]mite\s+\w+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return limpio || null;
}

// ─── Reglas por intent ────────────────────────────────────────────────────────

const REGLAS = [

    // ── CREAR TAREA ──────────────────────────────────────────────────────────
    {
        intent: 'crear_tarea',
        confianza: 0.98,
        test(t) {
            return (
                // Forma directa: "crea/agrega/nueva... una tarea de X"
                /\b(crea|crear|agrega|agregar|a[nñ]ade|a[nñ]adir|nueva?|nuevo|registra|registrar|manda\s+a|mandar\s+a|hay\s+que|tengo\s+que)\b.{0,20}\b(tarea|pendiente|to[\-\s]?do)\b/i.test(t)
                // Forma invertida: "tarea nueva de X" / "tarea de X para Y"
                || /\b(tarea|pendiente)\s+(nueva?|urgente)\b/i.test(t)
                // Al inicio de la frase: "tarea de recoger...", "nueva tarea de..."
                || /^(nueva?\s+tarea|tarea\s+nueva?|tarea\s+de\s+)\b/i.test(t)
            );
        },
        entidades(t) {
            const titulo = extraerTitulo(t, [
                /\b(crea|crear|agrega|agregar|a[nñ]ade|a[nñ]adir|nueva?|nuevo|registra|registrar|manda\s+a|mandar\s+a|hay\s+que|tengo\s+que)\s+(una?\s+)?tarea\s+(de\s+)?/gi,
                /^(nueva?\s+)?tarea\s+(nueva?\s+)?(de\s+)?/gi,
                /\b(tarea|pendiente)\b\s*/gi,
            ]);
            return {
                titulo,
                fecha:       extraerFecha(t),
                descripcion: null,
                prioridad:   /\b(urgente|urgencia|alta\s+prioridad|m[aá]xima\s+urgencia|urgencia\s+m[aá]xima|prioridad\s+alta)\b/i.test(t) ? 'alta' : 'media',
            };
        },
        frase(ent) {
            const titulo = ent.titulo ? `*${ent.titulo}*` : '(sin título)';
            const fecha  = ent.fecha  ? `con fecha límite *${ent.fecha}*` : 'sin fecha límite';
            const prio   = ent.prioridad === 'alta' ? ' 🔴 Prioridad alta' : '';
            return `Vas a crear la tarea ${titulo} ${fecha}${prio} ✅`;
        }
    },


    // ── BUSCAR TAREA ─────────────────────────────────────────────────────────
    {
        intent: 'buscar_tarea',
        confianza: 0.97,
        test(t) {
            return (
                // "busca/ver/dame/muestra las tareas..."
                /\b(busca|buscar|encuentra|ver|mostrar|muestra|listar|lista|dame)\b.{0,25}\b(tarea|tareas|pendiente|pendientes)\b/i.test(t)
                // "qué tareas tengo/hay/quedaron..." — la palabra tarea aparece sola
                || /\bqu[eé]\s+tareas?\b/i.test(t)
                // "cuántas/cuáles tareas..."
                || /\b(cu[aá]ntas?|cu[aá]les?)\s+(son\s+)?(mis\s+)?(las\s+)?tareas?\b/i.test(t)
                // "mis tareas activas/abiertas/de hoy"
                || /\b(mis\s+)?(tarea|tareas|pendiente|pendientes)\b.{0,15}\b(activas?|abiertas?|pendientes?|de\s+hoy|de\s+ma[nñ]ana)\b/i.test(t)
                // "tareas de hoy/mañana"
                || /\btareas?\s+de\s+(hoy|ma[nñ]ana|esta\s+semana)\b/i.test(t)
            );
        },
        entidades(t) {
            const kw = extraerTitulo(t, [
                /\b(busca|buscar|encuentra|ver|mostrar|muestra|listar|lista|dame)\s+(la\s+|las\s+|el\s+|una?\s+)?(mis\s+)?(tarea|tareas|pendiente|pendientes)?\s*/gi,
                /\bqu[eé]\s+tareas?\s+(tengo|hay|quedaron|me\s+faltan)?\s*/gi,
                /\b(cu[aá]ntas?|cu[aá]les?)\s+(son\s+)?(mis\s+)?(las\s+)?tareas?\s*/gi,
                /\b(mis\s+)?(tarea|tareas|pendiente|pendientes)\b/gi,
            ]);
            return { palabras_clave: kw || '', titulo: kw, fecha: extraerFecha(t) };
        },
        frase(ent) {
            if (ent.fecha) return `Buscando tus tareas para *${ent.fecha}*...`;
            return ent.palabras_clave
                ? `Buscando tareas con "${ent.palabras_clave}"...`
                : `Buscando tus tareas...`;
        }
    },


    // ── TAREAS RETRASADAS ─────────────────────────────────────────────────────
    {
        intent: 'buscar_tareas_retrasadas',
        confianza: 0.99,
        test(t) {
            return /\b(retrasadas?|vencidas?|atrasadas?|tareas?\s+vencidas?|fuera\s+de\s+tiempo)\b/i.test(t);
        },
        entidades() { return {}; },
        frase()     { return 'Buscando tareas retrasadas o vencidas... ⏰'; }
    },

    // ── RESUMEN SEMANA ────────────────────────────────────────────────────────
    {
        intent: 'resumen_tareas_semana',
        confianza: 0.99,
        test(t) {
            return /\b(resumen\s+(de\s+la\s+)?semana|tareas?\s+de\s+la\s+semana|resumen\s+semanal)\b/i.test(t)
                || /\b(tareas?|actividades?).{0,15}\b(esta\s+semana|semanal)\b/i.test(t);
        },
        entidades() { return {}; },
        frase()     { return 'Generando resumen de tareas de la semana... 📊'; }
    },

    // ── FINALIZAR TAREA ───────────────────────────────────────────────────────
    {
        intent: 'finalizar_tarea',
        confianza: 0.97,
        test(t) {
            return /\b(finaliza|finalizar|completa|completar|termina|terminar|cierra|cerrar|marca(\s+como)?\s+finalizada?|marca(\s+como)?\s+completada?)\b.{0,25}\b(tarea|pendiente)\b/i.test(t);
        },
        entidades(t) {
            const kw = extraerTitulo(t, [
                /\b(finaliza|finalizar|completa|completar|termina|terminar|cierra|cerrar|marca(\s+como)?\s+\w+)\s+(la\s+)?(una?\s+)?(tarea\s+de\s+)?(tarea\s+)?(de\s+)?/gi,
                /\b(tarea|pendiente)\b/gi,
            ]);
            return { palabras_clave: kw, titulo: kw };
        },
        frase(ent) { return `Vas a finalizar la tarea *"${ent.titulo || ent.palabras_clave}"* ✅`; }
    },

    // ── CANCELAR TAREA ────────────────────────────────────────────────────────
    {
        intent: 'cancelar_tarea',
        confianza: 0.97,
        test(t) {
            // Evitar confundir "cancela la tarea" (intent) con "no, cancela" (cf. evaluarRespuesta)
            return /\b(cancela|cancelar|elimina|eliminar|borra|borrar|descarta|descartar)\b.{0,25}\b(tarea|pendiente)\b/i.test(t);
        },
        entidades(t) {
            const kw = extraerTitulo(t, [
                /\b(cancela|cancelar|elimina|eliminar|borra|borrar|descarta|descartar)\s+(la\s+)?(una?\s+)?(tarea\s+de\s+)?(tarea\s+)?(de\s+)?/gi,
                /\b(tarea|pendiente)\b/gi,
            ]);
            return { palabras_clave: kw, titulo: kw };
        },
        frase(ent) { return `Vas a cancelar la tarea *"${ent.titulo || ent.palabras_clave}"* 🚫`; }
    },

    // ── CREAR REUNIÓN ─────────────────────────────────────────────────────────
    {
        intent: 'crear_reunion',
        confianza: 0.98,
        test(t) {
            return /\b(agenda|agendar|crea|crear|programa|programar|nueva?)\b.{0,15}\b(reuni[o\u00f3]n|meeting|cita)\b/i.test(t);
        },
        entidades(t) {
            const titulo = extraerTitulo(t, [
                /\b(agenda|agendar|crea|crear|programa|programar|nueva?)\s+(una?\s+)?(reuni[o\u00f3]n|meeting|cita)\s*(de\s+|sobre\s+)?/gi,
                /\b(reuni[o\u00f3]n|meeting|cita)\b/gi,
            ]);
            return { titulo, fecha: extraerFecha(t) };
        },
        frase(ent) {
            const titulo = ent.titulo ? `*${ent.titulo}*` : '';
            const fecha  = ent.fecha  ? `para el *${ent.fecha}*` : '';
            return `Vas a agendar la reunión ${titulo} ${fecha} 📅`.trim();
        }
    },

    // ── HORARIOS LIBRES ───────────────────────────────────────────────────────
    {
        intent: 'horarios_libres',
        confianza: 0.99,
        test(t) {
            return /\b(horarios?\s+libres?|disponibilidad|tiempos?\s+libres?|cu[a\u00e1]ndo\s+(est[a\u00e1]s?|tengo)\s+libre)\b/i.test(t);
        },
        entidades(t) { return { fecha_consulta: extraerFecha(t) }; },
        frase()      { return 'Revisando horarios disponibles... 🗓️'; }
    },

    // ── CREAR NOTA ────────────────────────────────────────────────────────────
    {
        intent: 'crear_nota',
        confianza: 0.97,
        test(t) {
            return /\b(crea|crear|anota|anotar|escribe|escribir|guarda|guardar|nueva?)\b.{0,15}\b(nota|apunte|recordatorio)\b/i.test(t);
        },
        entidades(t) {
            const titulo = extraerTitulo(t, [
                /\b(crea|crear|anota|anotar|escribe|escribir|guarda|guardar|nueva?)\s+(una?\s+)?(nota|apunte|recordatorio)\s*(de\s+|sobre\s+)?/gi,
                /\b(nota|apunte|recordatorio)\b/gi,
            ]);
            return { titulo, contenido: titulo };
        },
        frase(ent) { return `Creando nota: *${ent.titulo || 'Nueva nota'}* 📝`; }
    },

    // ── BUSCAR NOTA ───────────────────────────────────────────────────────────
    {
        intent: 'buscar_nota',
        confianza: 0.97,
        test(t) {
            return /\b(busca|buscar|encuentra|ver|muestra|mostrar)\b.{0,15}\b(nota|apunte|notas|apuntes)\b/i.test(t);
        },
        entidades(t) {
            const kw = extraerTitulo(t, [
                /\b(busca|buscar|encuentra|ver|muestra|mostrar)\s+(la\s+|las\s+|una?\s+)?(nota|apunte|notas|apuntes)\s*(de\s+|sobre\s+)?/gi,
                /\b(nota|apunte|notas|apuntes)\b/gi,
            ]);
            return { palabras_clave: kw };
        },
        frase(ent) { return `Buscando nota: "${ent.palabras_clave || ''}"...`; }
    },
];

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Intenta clasificar el mensaje localmente sin llamar a ninguna IA.
 * @param {string} mensaje
 * @returns {{ intent, entidades, confianza, ambiguo, frase_confirmacion, proveedor_usado }|null}
 */
function preclasificar(mensaje) {
    const texto = mensaje.trim();

    for (const regla of REGLAS) {
        if (regla.test(texto)) {
            const entidades = regla.entidades(texto);
            return {
                intent:             regla.intent,
                entidades,
                confianza:          regla.confianza,
                ambiguo:            false,
                frase_confirmacion: regla.frase(entidades),
                proveedor_usado:    'local-regex',
            };
        }
    }

    return null; // No hay match — usar IA
}

module.exports = { preclasificar };
