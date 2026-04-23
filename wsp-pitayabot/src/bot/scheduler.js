'use strict';

/**
 * scheduler.js — Cron jobs automáticos de PitayaBot
 *
 * 6 jobs:
 *  - alertas_operacionales : cada 1 min  (PC offline, anulaciones web, etc.)
 *  - briefing_diario       : Lun-Vie 7:00 AM
 *  - recordatorio_reunion  : cada 15 min
 *  - resumen_fin_dia       : Lun-Vie 6:00 PM
 *  - revision_semanal      : Viernes 5:00 PM
 *  - cumpleanios           : Diario 8:00 AM
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
//  (usado por briefing, reunion, cumpleaños, etc.)
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
//  Helper: Alertas operacionales (formato propio)
//
//  La API retorna:
//    { success: true, alertas: [{ tipo, key_unica, mensaje, destinatarios[] }] }
//
//  El bot envía directo (no delega el envío a PHP).
//  Cada alerta ya fue registrada en alertas_wsp_estado por la API antes de retornar.
// ─────────────────────────────────────────────

async function ejecutarAlertas(clienteWA) {
    try {
        const resp = await axios.get(`${API_BASE_URL}/api/alertas/check_all.php`, {
            headers: HEADERS,
            timeout: 30_000
        });

        if (!resp.data?.success) return;

        const alertas = resp.data.alertas || [];
        if (alertas.length === 0) return;

        log(MODULO, `🔔 ${alertas.length} alerta(s) detectada(s) — enviando...`);

        for (const alerta of alertas) {
            for (const numero of alerta.destinatarios || []) {
                try {
                    // numero viene sin código de país (8 dígitos NI) → agregar 505
                    const numeroLimpio = String(numero).replace(/\D/g, '');
                    const jid = (numeroLimpio.length === 8 ? '505' + numeroLimpio : numeroLimpio) + '@c.us';
                    await clienteWA.sendMessage(jid, alerta.mensaje);
                    await delay(1500); // Anti-ban: 1.5 s entre envíos
                } catch (sendErr) {
                    logError(MODULO, `Error enviando alerta a ${numero}`, sendErr);
                }
            }
            log(MODULO, `  ✅ [${alerta.tipo}] → ${alerta.destinatarios?.length || 0} destinatario(s)`);
        }

    } catch (err) {
        // Silenciar timeouts normales; solo loguear errores inesperados
        if (err.code !== 'ECONNABORTED' && err.response?.status !== 401) {
            logError(MODULO, 'Error en alertas operacionales', err);
        }
    }
}

// ─────────────────────────────────────────────
//  Inicializar todos los crons
// ─────────────────────────────────────────────

function iniciarScheduler(clienteWA) {
    log(MODULO, '🚀 Iniciando scheduler de PitayaBot...');

    // ── Alertas operacionales — cada 1 minuto (PC offline, anulaciones web, etc.)
    cron.schedule('* * * * *', () => {
        ejecutarAlertas(clienteWA);
    }, { timezone: TZ });

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

    log(MODULO, '✅ 6 crons registrados (America/Managua)');
}

module.exports = { iniciarScheduler };
