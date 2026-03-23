'use strict';

/**
 * classifier.js — Clasificador de intenciones con IA (rotador multi-proveedor)
 *
 * Hace cascada entre todos los proveedores activos en ia_proveedores_api
 * exactamente como el AIService.php del ERP:
 * google → openai → deepseek → mistral → cerebras → openrouter → huggingface → groq
 */

const axios = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../config/api');
const { log, logError } = require('../utils/logger');

// Orden de cascada de proveedores (mismo que ERP AIService.php)
const CASCADA_PROVEEDORES = [
    'google', 'openai', 'deepseek', 'mistral',
    'cerebras', 'openrouter', 'huggingface', 'groq'
];

// Configuración de endpoints y modelos por proveedor
const PROVEEDOR_CONFIG = {
    google: {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        model: 'gemini-flash-latest',
        tipo: 'google'
    },
    openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        tipo: 'openai'
    },
    deepseek: {
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat',
        tipo: 'openai'
    },
    mistral: {
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        model: 'mistral-medium-latest',
        tipo: 'openai'
    },
    cerebras: {
        endpoint: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'llama3.1-70b',
        tipo: 'openai'
    },
    openrouter: {
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        tipo: 'openrouter'
    },
    huggingface: {
        endpoint: 'https://router.huggingface.co/v1/chat/completions',
        model: 'meta-llama/Llama-3.2-3B-Instruct',
        tipo: 'openai'
    },
    groq: {
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
        tipo: 'openai'
    }
};

/**
 * Construye el system prompt del clasificador con la fecha actual Nicaragua
 */
function buildSystemPrompt() {
    const hoy = new Date().toLocaleDateString('es-NI', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'America/Managua'
    });

    return `Eres un clasificador de intenciones para un asistente empresarial por WhatsApp.
El usuario trabaja en una empresa y te envía mensajes en español para gestionar
sus tareas, reuniones, notas, correos y recordatorios.

Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional,
sin backticks, sin explicaciones.

Intenciones disponibles:
- crear_tarea
- buscar_tarea
- modificar_tarea_fecha
- finalizar_tarea
- cancelar_tarea
- buscar_tareas_retrasadas
- resumen_tareas_semana
- crear_reunion
- buscar_reunion
- modificar_reunion_fecha
- cancelar_reunion
- resumen_reuniones_semana
- horarios_libres
- crear_nota
- buscar_nota
- crear_nota_decision
- enviar_correo
- buscar_correo
- correos_pendientes
- consulta_libre
- desconocido

Responde EXACTAMENTE con este esquema JSON:
{
  "intent": "nombre_de_la_intencion",
  "entidades": {
    "titulo": "texto del título o null",
    "descripcion": "descripción adicional o null",
    "fecha": "YYYY-MM-DD o null",
    "hora": "HH:MM o null",
    "participantes": ["nombre1", "nombre2"],
    "prioridad": "alta|media|baja o null",
    "estado_destino": "finalizado|cancelado o null",
    "contenido": "cuerpo del mensaje/nota o null",
    "destinatario": "nombre del destinatario o null",
    "remitente": "nombre del remitente a buscar o null",
    "palabras_clave": ["kw1", "kw2"],
    "fecha_consulta": "YYYY-MM-DD o null"
  },
  "confianza": 0.95,
  "ambiguo": false,
  "frase_confirmacion": "Texto en español resumiendo la acción que se va a ejecutar"
}

Hoy es: ${hoy}

Ejemplos por intención:
- crear_tarea: "créame una tarea", "agrega pendiente", "tarea urgente"
- crear_reunion: "programa una reunión", "agenda un meeting", "convoca a"
- modificar_reunion_fecha: "cambia la reunión", "mueve la junta", "reprograma el meeting"
- cancelar_reunion: "cancela la reunión", "ya no habrá reunión", "borra el meeting"
- crear_nota: "crea una nota", "anota esto", "guarda esta idea", "idea:"
- crear_nota_decision: "decisión:", "decidí", "queda registrado que decidimos"
- buscar_tarea: "búscame la tarea", "¿tengo tareas de?", "busca tarea de"
- finalizar_tarea: "finaliza la tarea", "marca como completada", "ya terminé"
- buscar_correo: "busca un correo de", "encuéntrame el correo"
- enviar_correo: "envía correo a", "mándale un mensaje a", "escríbele a"
- horarios_libres: "qué horario tengo libre", "cuándo estoy libre el"
- resumen_tareas_semana: "tareas de esta semana", "qué tengo pendiente esta semana"
- resumen_reuniones_semana: "reuniones de esta semana", "qué reuniones tengo"
- correos_pendientes: "correos sin responder", "qué correos tengo pendientes"`;
}

/**
 * Llama a un proveedor de IA con el prompt del usuario.
 * @param {object} config  Configuración del proveedor
 * @param {string} apiKey  API key activa
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {string} Texto crudo de la respuesta
 */
async function llamarProveedor(config, apiKey, systemPrompt, userPrompt) {
    let url     = config.endpoint;
    const headers = { 'Content-Type': 'application/json' };
    let payload;

    if (config.tipo === 'google') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`;
        payload = {
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nMensaje del usuario:\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024, response_mime_type: 'application/json' }
        };
    } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
        if (config.tipo === 'openrouter') {
            headers['HTTP-Referer'] = 'https://api.batidospitaya.com';
            headers['X-Title']      = 'Batidos Pitaya PitayaBot';
        }
        payload = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt }
            ],
            temperature: 0.1,
            max_tokens:  800,
            top_p:       0.9
        };
    }

    const resp = await axios.post(url, payload, { headers, timeout: 30_000 });
    let content = '';

    if (config.tipo === 'google') {
        content = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
        content = resp.data?.choices?.[0]?.message?.content || '';
    }

    if (!content) throw new Error('Respuesta vacía del proveedor');
    return content;
}

/**
 * Extrae y parsea el JSON de la respuesta del LLM.
 * @param {string} text
 * @returns {object}
 */
function extraerJSON(text) {
    const inicio = text.indexOf('{');
    const fin    = text.lastIndexOf('}');
    if (inicio === -1 || fin === -1) throw new Error('No se encontró JSON en respuesta IA');
    const jsonStr = text.slice(inicio, fin + 1);
    return JSON.parse(jsonStr);
}

/**
 * Obtiene la API key activa de un proveedor vía endpoint PHP.
 * @param {string} proveedor
 * @returns {string|null}
 */
async function obtenerApiKey(proveedor) {
    try {
        const resp = await axios.get(
            `${API_BASE_URL}/api/bot/ia/obtener_api_key.php`,
            {
                params:  { proveedor },
                headers: { 'X-WSP-Token': WSP_TOKEN },
                timeout: 8_000
            }
        );
        if (resp.data?.success && resp.data?.api_key) {
            return resp.data.api_key;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Clasifica el mensaje del usuario usando cascada de proveedores IA.
 * @param {string} mensaje  Texto enviado por el usuario
 * @returns {object} { intent, entidades, confianza, ambiguo, frase_confirmacion }
 */
async function clasificar(mensaje) {
    const systemPrompt = buildSystemPrompt();
    const erroresAcumulados = [];

    for (const proveedor of CASCADA_PROVEEDORES) {
        const apiKey = await obtenerApiKey(proveedor);
        if (!apiKey) {
            log('CLASSIFIER', `⏭️  Sin keys para ${proveedor}, saltando...`);
            continue;
        }

        const config = PROVEEDOR_CONFIG[proveedor];
        try {
            log('CLASSIFIER', `🤖 Intentando con ${proveedor}...`);
            const texto = await llamarProveedor(config, apiKey, systemPrompt, mensaje);
            const resultado = extraerJSON(texto);

            // Validar campos mínimos
            if (!resultado.intent || resultado.confianza === undefined) {
                throw new Error('JSON incompleto — faltan campos requeridos');
            }

            log('CLASSIFIER', `✅ Clasificado via ${proveedor}: ${resultado.intent} (conf: ${resultado.confianza})`);
            return resultado;

        } catch (err) {
            const msg = `${proveedor.toUpperCase()}: ${err.message}`;
            erroresAcumulados.push(msg);
            logError('CLASSIFIER', `Fallo con ${proveedor}`, err);
        }
    }

    // Todos fallaron — devolver intent desconocido
    log('CLASSIFIER', `⚠️ Todos los proveedores fallaron: ${erroresAcumulados.join(' | ')}`);
    return {
        intent:            'desconocido',
        entidades:         {},
        confianza:         0,
        ambiguo:           true,
        frase_confirmacion:'No pude entender tu mensaje. ¿Puedes reformularlo?'
    };
}

module.exports = { clasificar };
