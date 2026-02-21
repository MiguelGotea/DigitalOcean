'use strict';

const cron = require('node-cron');
const axios = require('axios');
const { obtenerCliente } = require('../whatsapp/client');
const { enviarLote } = require('../whatsapp/sender');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');

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
    const hora = ahora.getHours(); // hora local del VPS (debe estar en UTC-6)
    const [hI] = (process.env.HORA_INICIO_ENVIO || '08:00').split(':').map(Number);
    const [hF] = (process.env.HORA_FIN_ENVIO || '20:00').split(':').map(Number);
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
 */
async function obtenerPendientes() {
    const resp = await axios.get(`${API_BASE_URL}/api/wsp/pendientes.php`, {
        headers: { 'X-WSP-Token': WSP_TOKEN },
        timeout: 15_000
    });
    return resp.data; // { campanas: [...] }
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

/**
 * Ciclo principal del worker — se ejecuta cada 60 segundos
 */
async function ejecutarCiclo() {
    try {
        const client = obtenerCliente();

        // Verificar que WhatsApp está conectado
        if (!client || client.info === undefined) {
            return; // No conectado, esperar
        }

        // Verificar horario y límites
        verificarContadorDiario();
        if (!enHorarioPermitido()) {
            console.log('🌙 Fuera del horario de envío. Esperando...');
            return;
        }
        if (mensajesEnviadosHoy >= MAX_DIA) {
            console.log(`⚠️  Límite diario alcanzado (${MAX_DIA}). Reiniciará mañana.`);
            return;
        }

        // Obtener campañas listas para enviar
        const data = await obtenerPendientes();
        if (!data.campanas || data.campanas.length === 0) {
            return; // Sin campañas pendientes
        }

        console.log(`📋 ${data.campanas.length} campaña(s) pendiente(s) detectadas`);

        for (const campana of data.campanas) {
            if (!campana.destinatarios || campana.destinatarios.length === 0) continue;

            // Limitar el lote por hora
            const espacioDisponible = MAX_HORA - 0; // simplificado
            const lote = campana.destinatarios.slice(0, Math.min(espacioDisponible, campana.destinatarios.length));

            await enviarLote(client, campana, lote, reportarResultado);
        }

    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            console.error('⚠️  No se puede conectar a la API:', err.message);
        } else {
            console.error('❌ Error en el worker:', err.message);
        }
    }
}

/**
 * Inicia el cron job — ejecuta cada 60 segundos
 */
function iniciarWorker() {
    console.log('⏰ Worker de campañas iniciado (cada 60 segundos)');
    cron.schedule('*/1 * * * *', ejecutarCiclo);  // cada 1 minuto
}

module.exports = { iniciarWorker };
