#!/usr/bin/env node
/**
 * TEST DEL VPS — Verifica conectividad con la API puente
 * Ejecutar en el VPS: node scripts/test_api_connection.js
 *
 * Pruebas:
 *  [1] GET /api/wsp/ping.php          — API accesible
 *  [2] GET /api/wsp/pendientes.php    — Autenticación con token
 *  [3] POST /api/wsp/registrar_sesion.php — Escritura
 */

'use strict';
require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'https://api.batidospitaya.com';
const TOKEN = process.env.WSP_TOKEN;

const VERDE = '\x1b[32m';
const ROJO = '\x1b[31m';
const RESET = '\x1b[0m';
const ok = (msg) => console.log(`${VERDE}  ✅ ${msg}${RESET}`);
const fail = (msg) => console.log(`${ROJO}  ❌ ${msg}${RESET}`);

async function test(nombre, fn) {
    process.stdout.write(`\n[TEST] ${nombre}... `);
    try {
        const resultado = await fn();
        ok(resultado);
    } catch (e) {
        fail(e.message);
    }
}

(async () => {
    console.log('\n========================================');
    console.log(' Pitaya WSP — Test de Conectividad API');
    console.log(`  Base URL: ${API_BASE}`);
    console.log(`  Token: ${TOKEN ? TOKEN.substring(0, 6) + '...' : '❌ NO DEFINIDO'}`);
    console.log('========================================');

    // [1] Ping básico
    await test('Ping a la API', async () => {
        const r = await axios.get(`${API_BASE}/api/wsp/ping.php`, { timeout: 8000 });
        return `HTTP ${r.status} — ${JSON.stringify(r.data)}`;
    });

    // [2] Autenticación con token
    await test('Endpoint /pendientes (autenticación)', async () => {
        const r = await axios.get(`${API_BASE}/api/wsp/pendientes.php`, {
            headers: { 'X-WSP-Token': TOKEN },
            timeout: 10000
        });
        return `HTTP ${r.status} — ${r.data.campanas ? r.data.campanas.length + ' campañas' : JSON.stringify(r.data)}`;
    });

    // [3] Token incorrecto (debe fallar con 401)
    await test('Rechazo con token incorrecto (expect 401)', async () => {
        try {
            await axios.get(`${API_BASE}/api/wsp/pendientes.php`, {
                headers: { 'X-WSP-Token': 'token_invalido_abc' },
                timeout: 8000
            });
            return '⚠️  Debería haber rechazado el token!';
        } catch (e) {
            if (e.response && e.response.status === 401) return `Rechazado correctamente (401)`;
            throw e;
        }
    });

    // [4] Registrar sesión (escritura)
    await test('POST /registrar_sesion (estado: test)', async () => {
        const r = await axios.post(`${API_BASE}/api/wsp/registrar_sesion.php`,
            { estado: 'desconectado', qr_base64: null },
            { headers: { 'X-WSP-Token': TOKEN }, timeout: 10000 }
        );
        return `HTTP ${r.status} — ${JSON.stringify(r.data)}`;
    });

    console.log('\n========================================');
    console.log('  Tests completados.');
    console.log('========================================\n');
})();
