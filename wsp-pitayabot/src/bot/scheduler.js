'use strict';

/**
 * scheduler.js — Cron jobs automáticos de PitayaBot
 *
 * 5 jobs:
 *  - briefing_diario      : Lun-Vie 7:00 AM
 *  - recordatorio_reunion : cada 15 min
 *  - resumen_fin_dia      : Lun-Vie 6:00 PM
 *  - revision_semanal     : Viernes 5:00 PM
 *  - cumpleanios          : Diario 8:00 AM
 *
 * Cada cron verifica su flag `activo` en bot_crons_config (PHP lo gestiona).
 * El scheduler solo envía lo que el PHP devuelva en data[].
 */

const cron   = require('node-cron');
const axios  = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { log, logError }           = require('../utils/logger');

const MODULO  = 'SCHEDULER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN };
const TZ      = 'America/Managua';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────
//  Helper: llama endpoint y envía mensajes
// ─────────────────────────────────────────────

async function ejecutarCron(nombre, endpoint, clienteWA) {
    try {
        log(MODULO, `⏰ Ejecutando cron: ${nombre}`);

        // Llamamos con ?ejecutar=1 para que la API haga el envío y actualice el TS
        const resp = await axios.get(`${API_BASE_URL}${endpoint}?ejecutar=1`, {
            headers: HEADERS,
            timeout: 60_000 // Aumentamos timeout para esperar el envío real de la API
        });

        if (!resp.data?.success) {
            log(MODULO, `⚠️ ${nombre}: PHP retornó error — ${resp.data?.message}`);
            return;
        }

        const count = resp.data.data?.length || 0;
        if (count === 0) {
            log(MODULO, `ℹ️ ${nombre}: Sin mensajes que enviar (${resp.data?.motivo || 'sin datos'})`);
            return;
        }

        log(MODULO, `✅ Cron ${nombre} completado — ${count} mensajes procesados por la API`);

    } catch (err) {
        logError(MODULO, `Error en cron ${nombre}`, err);
    }
}

// ─────────────────────────────────────────────
//  Inicializar todos los crons
// ─────────────────────────────────────────────

function iniciarScheduler(clienteWA) {
    log(MODULO, '🚀 Iniciando scheduler de PitayaBot...');

    // ── Briefing matutino — Lunes a Viernes 7:00 AM
    cron.schedule('0 7 * * 1-5', () => {
        ejecutarCron('Briefing Matutino', '/api/bot/scheduler/briefing_diario.php', clienteWA);
    }, { timezone: TZ });

    // ── Recordatorio de reunión — cada 15 minutos
    cron.schedule('*/15 * * * *', () => {
        ejecutarCron('Recordatorio Reunión', '/api/bot/scheduler/recordatorio_reunion.php', clienteWA);
    }, { timezone: TZ });

    // ── Resumen fin de día — Lunes a Viernes 6:00 PM
    cron.schedule('0 18 * * 1-5', () => {
        ejecutarCron('Resumen Fin de Día', '/api/bot/scheduler/resumen_fin_dia.php', clienteWA);
    }, { timezone: TZ });

    // ── Revisión semanal — Viernes 5:00 PM
    cron.schedule('0 17 * * 5', () => {
        ejecutarCron('Revisión Semanal', '/api/bot/scheduler/revision_semanal.php', clienteWA);
    }, { timezone: TZ });

    // ── Cumpleaños — Diariamente 8:00 AM
    cron.schedule('0 8 * * *', () => {
        ejecutarCron('Cumpleaños', '/api/bot/scheduler/cumpleanios.php', clienteWA);
    }, { timezone: TZ });

    log(MODULO, '✅ 5 crons registrados (America/Managua)');
}

module.exports = { iniciarScheduler };
