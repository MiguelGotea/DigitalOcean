'use strict';

const cron = require('node-cron');
const axios = require('axios');
const { obtenerCliente, resetearSesion } = require('../whatsapp/client');
const { enviarLote } = require('../whatsapp/sender');
const { API_BASE_URL, WSP_TOKEN, WSP_INSTANCIA } = require('../config/api');

// Control anti-ban diario
let mensajesEnviadosHoy = 0;
let fechaContador = new Date().toDateString();
const MAX_DIA = parseInt(process.env.MAX_MENSAJES_DIA) || 150;
const MAX_HORA = parseInt(process.env.MAX_MENSAJES_POR_HORA) || 50;

/**
 * Verifica si estamos en horario permitido de envío (8am - 8pm Nicaragua)
 */
function enHorarioPermitido() {
    const ahora = new Date();
    const hora = ahora.getHours();

    // Horario solicitado: 7am a 10pm (22:00)
    const hI = 7;
    const hF = 22;

    return hora >= hI && hora < hF;
}

/**
 * Reinicia el contador diario si cambió el día
 */
function verificarContadorDiario() {
    const hoy = new Date().toDateString();
    if (hoy !== fechaContador) {
        mensajesEnviadosHoy = 0;
        fechaContador = hoy;
        console.log('🔄 Contador diario reiniciado.');
    }
}

/**
 * Obtiene campañas pendientes desde api.batidospitaya.com
 * La respuesta también incluye reset_solicitado para detectar cambio de número
 */
async function obtenerPendientes() {
    const resp = await axios.get(`${API_BASE_URL}/api/wsp/pendientes.php`, {
        headers: { 'X-WSP-Token': WSP_TOKEN },
        params: { instancia: WSP_INSTANCIA },
        timeout: 15_000
    });
    return resp.data; // { campanas: [...], reset_solicitado: bool }
}

/**
 * Reporta el resultado de cada mensaje enviado a la API
 */
async function reportarResultado(campanaId, destinatarioId, resultado, detalle) {
    try {
        await axios.post(`${API_BASE_URL}/api/wsp/actualizar.php`, {
            campana_id: campanaId,
            destinatario_id: destinatarioId,
            resultado,
            detalle
        }, {
            headers: { 'X-WSP-Token': WSP_TOKEN },
            timeout: 10_000
        });

        if (resultado === 'exito') mensajesEnviadosHoy++;
    } catch (err) {
        console.error('⚠️  Error reportando resultado:', err.message);
    }
}

// Flag para evitar ejecuciones superpuestas
let ejecutandoCicloFlag = false;

/**
 * Ciclo principal del worker — se ejecuta cada 60 segundos
 */
async function ejecutarCiclo() {
    if (ejecutandoCicloFlag) {
        console.log('⏳ Ciclo de worker ya en curso, saltando...');
        return;
    }

    try {
        ejecutandoCicloFlag = true;
        // Consultar campañas pendientes
        const data = await obtenerPendientes();

        const client = obtenerCliente();

        // Verificar que WhatsApp está conectado
        if (!client || client.info === undefined) {
            ejecutandoCicloFlag = false;
            return; // No conectado, esperar
        }

        // Verificar horario y límites
        verificarContadorDiario();
        if (!enHorarioPermitido()) {
            console.log('🌙 Fuera del horario de envío. Esperando...');
            ejecutandoCicloFlag = false;
            return;
        }
        if (mensajesEnviadosHoy >= MAX_DIA) {
            console.log(`⚠️  Límite diario alcanzado (${MAX_DIA}). Reiniciará mañana.`);
            ejecutandoCicloFlag = false;
            return;
        }

        if (!data.campanas || data.campanas.length === 0) {
            ejecutandoCicloFlag = false;
            return; // Sin campañas pendientes
        }

        console.log(`📋 ${data.campanas.length} campaña(s) pendiente(s) detectadas`);

        for (const campana of data.campanas) {
            if (!campana.destinatarios || campana.destinatarios.length === 0) continue;

            const espacioDisponible = MAX_HORA - 0;
            const lote = campana.destinatarios.slice(0, Math.min(espacioDisponible, campana.destinatarios.length));

            await enviarLote(client, campana, lote, reportarResultado);
        }

    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            console.error('⚠️  No se puede conectar a la API:', err.message);
        } else {
            console.error('❌ Error en el worker:', err.message);
        }
    } finally {
        ejecutandoCicloFlag = false;
    }
}

/**
 * Inicia el cron job — ejecuta cada 60 segundos
 */
function iniciarWorker() {
    console.log('⏰ Worker de campañas iniciado (cada 60 segundos)');
    cron.schedule('*/1 * * * *', ejecutarCiclo);
}

module.exports = { iniciarWorker };
