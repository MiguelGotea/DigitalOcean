'use strict';

/**
 * notasHandler.js — Router de intents del módulo de notas Obsidian
 *
 * Intents manejados:
 *  crear_nota, crear_nota_decision, buscar_nota, crear_nota_dictado
 *
 * Flujo:
 *  1. Obtener config GitHub del operario vía PHP endpoint
 *  2. Descifrar token con AES-256-CBC
 *  3. Construir GitHubClient y ejecutar la acción
 */

const axios      = require('axios');
const { API_BASE_URL, WSP_TOKEN } = require('../../config/api');
const { log, logError }           = require('../../utils/logger');
const { descifrar }               = require('../../utils/crypto');
const GitHubClient                = require('../../utils/githubClient');

const MODULO  = 'NOTAS_HANDLER';
const HEADERS = { 'X-WSP-Token': WSP_TOKEN };
const TIMEOUT = 15_000;

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Obtiene la config GitHub del operario desde PHP y construye el GitHubClient.
 * @returns {GitHubClient}
 * @throws {Error} Si el operario no tiene Obsidian configurado
 */
async function obtenerGitHubClient(codOperario) {
    const resp = await axios.get(
        `${API_BASE_URL}/api/bot/notas/obtener_config.php`,
        { params: { cod_operario: codOperario }, headers: HEADERS, timeout: 8_000 }
    );

    if (!resp.data?.success) {
        throw new Error('SIN_OBSIDIAN');
    }

    const { github_token_enc, github_repo, github_branch, github_vault_folder } = resp.data.data;

    if (!github_token_enc || !github_repo) {
        throw new Error('SIN_OBSIDIAN');
    }

    // Si el token tiene formato "iv:cifrado" -> descifrar; si no -> usar como texto plano
    const token = (github_token_enc && github_token_enc.includes(':'))
        ? descifrar(github_token_enc)
        : github_token_enc;
    const [owner, repo]  = github_repo.split('/');

    if (!owner || !repo) {
        throw new Error('Formato de github_repo inválido. Usa el formato owner/repo.');
    }

    return new GitHubClient(token, owner, repo, github_branch || 'main', github_vault_folder || '');
}

/**
 * Llama a la IA (via PHP endpoint obtener_api_key + axios) para procesar texto libre.
 * Retorna el texto generado como string.
 */
async function llamarIA(promptSistema, promptUsuario) {
    // Intentar Google primero (configurado en el ERP)
    const keyResp = await axios.get(
        `${API_BASE_URL}/api/bot/ia/obtener_api_key.php`,
        { params: { proveedor: 'google' }, headers: HEADERS, timeout: 8_000 }
    );
    const apiKey = keyResp.data?.api_key;
    if (!apiKey) throw new Error('No hay API key de IA disponible');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload   = {
        contents: [{
            role:  'user',
            parts: [{ text: `${promptSistema}\n\nTexto del usuario:\n${promptUsuario}` }]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
    };

    const r = await axios.post(geminiUrl, payload, { timeout: 20_000 });
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/** Genera el slug de un título para nombre de archivo: "Mi Nota" → "mi-nota" */
function slugify(titulo) {
    return titulo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')        // quitar tildes
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
}

/** Fecha actual en Nicaragua (América/Managua) como YYYY-MM-DD */
function fechaHoy() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Managua' });
}

/** Fecha larga en español para las notas de decisión */
function fechaLarga() {
    return new Date().toLocaleDateString('es-NI', {
        day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'America/Managua'
    });
}

// ─────────────────────────────────────────────
//  Formatos de notas Markdown
// ─────────────────────────────────────────────

function buildNotaEstandar(titulo, contenido) {
    return `---
fecha: ${fechaHoy()}
tags: [pitayabot, nota]
---

# ${titulo}

${contenido}
`;
}

function buildNotaDecision(titulo, contexto, decision, razon) {
    return `---
fecha: ${fechaHoy()}
tags: [pitayabot, decision]
tipo: decision
---

# Decisión: ${titulo}

**Fecha:** ${fechaLarga()}
**Contexto:** ${contexto}

## La decisión
${decision}
${razon ? `\n## Razón\n${razon}` : ''}
`;
}

// ─────────────────────────────────────────────
//  Ejecutor principal
// ─────────────────────────────────────────────

async function ejecutar(intent, entidades, operario) {
    log(MODULO, `▶ Ejecutando intent: ${intent}`);

    let client;
    try {
        client = await obtenerGitHubClient(operario.CodOperario);
    } catch (err) {
        if (err.message === 'SIN_OBSIDIAN') {
            return {
                respuesta: `🚫 No tienes almacenamiento de notas configurado.\nPara activar esta función, contacta a RRHH para configurar tu acceso.`,
                subflow: null
            };
        }
        logError(MODULO, 'Error obteniendo GitHub client', err);
        return { respuesta: `⚠️ Error al acceder a tu vault de notas. Intenta más tarde.`, subflow: null };
    }

    try {

        // ── CREAR NOTA ESTÁNDAR ──
        if (intent === 'crear_nota') {
            const contenidoRaw = entidades?.contenido || entidades?.titulo || '';
            if (!contenidoRaw) return { respuesta: `❌ No entendí el contenido de la nota. Indica "Nota: [tu texto]".`, subflow: null };

            // Si el contenido es largo o sin estructura, dejar que Gemini extraiga el título
            let titulo    = entidades?.titulo || null;
            let contenido = entidades?.contenido || contenidoRaw;

            if (!titulo || titulo === contenido) {
                const iaResp = await llamarIA(
                    'Extrae un título corto (máximo 6 palabras) del siguiente texto. Responde SOLO con el título, sin comillas ni puntuación extra.',
                    contenidoRaw
                );
                titulo = iaResp.trim().slice(0, 80) || 'Nota sin título';
            }

            const nombreArchivo = `${slugify(titulo)}.md`;
            const mdContenido   = buildNotaEstandar(titulo, contenido);

            await client.crearNota('', nombreArchivo, mdContenido);

            return {
                respuesta: `✅ *PitayaBot*\n\nNota guardada en tu vault:\n📝 *${titulo}*\n📅 ${fechaLarga()}`,
                subflow: null
            };
        }

        // ── CREAR NOTA DE DECISIÓN ──
        if (intent === 'crear_nota_decision') {
            const textoRaw = entidades?.contenido || entidades?.titulo || '';
            if (!textoRaw) return { respuesta: `❌ No entendí la decisión. Indica "Decisión: [tu texto]".`, subflow: null };

            // Gemini extrae los campos estructurados
            const iaResp = await llamarIA(
                `Analiza el siguiente texto de decisión empresarial y extrae:
- titulo: título corto de la decisión (máx 6 palabras)
- contexto: contexto o antecedente (1-2 oraciones)
- decision: la decisión tomada en sí
- razon: razón o justificación si se menciona, o "" si no hay

Responde SOLO con JSON: {"titulo":"","contexto":"","decision":"","razon":""}`,
                textoRaw
            );

            let campos = { titulo: 'Decisión', contexto: textoRaw, decision: textoRaw, razon: '' };
            try {
                const inicio = iaResp.indexOf('{');
                const fin    = iaResp.lastIndexOf('}');
                if (inicio !== -1 && fin !== -1) {
                    campos = JSON.parse(iaResp.slice(inicio, fin + 1));
                }
            } catch (_) { /* usar defaults */ }

            const hoy           = fechaHoy();
            const nombreArchivo = `${hoy}_${slugify(campos.titulo || 'decision')}.md`;
            const mdContenido   = buildNotaDecision(campos.titulo, campos.contexto, campos.decision, campos.razon);

            await client.crearNota('Decisiones', nombreArchivo, mdContenido);

            return {
                respuesta: `✅ *PitayaBot*\n\nDecisión registrada en /Decisiones/:\n🏛️ *${campos.titulo}*\n📅 ${fechaLarga()}`,
                subflow: null
            };
        }

        // ── CREAR NOTA DICTADO ──
        if (intent === 'crear_nota_dictado') {
            const textoRaw = entidades?.contenido || entidades?.titulo || '';
            if (!textoRaw) return { respuesta: `❌ No recibí texto para dictar. Indica el contenido de la nota.`, subflow: null };

            const iaResp = await llamarIA(
                `Reformatea el siguiente texto libre en una nota markdown bien estructurada.
Incluye:
- Frontmatter YAML con fecha (${fechaHoy()}), tags sugeridos
- Título H1 descriptivo
- Resumen de 1-2 oraciones
- Puntos clave como lista
- Cualquier detalle adicional relevante

Responde SOLO con el markdown completo, sin explicaciones.`,
                textoRaw
            );

            // Extraer título del H1 generado por Gemini
            const tituloMatch = iaResp.match(/^#\s+(.+)$/m);
            const titulo       = tituloMatch ? tituloMatch[1].trim() : 'Dictado';
            const nombreArchivo = `${fechaHoy()}_${slugify(titulo)}.md`;

            await client.crearNota('', nombreArchivo, iaResp.trim());

            return {
                respuesta: `✅ *PitayaBot*\n\nNota dictada guardada:\n🎙️ *${titulo}*\n📅 ${fechaLarga()}`,
                subflow: null
            };
        }

        // ── BUSCAR NOTA ──
        if (intent === 'buscar_nota') {
            const query = entidades?.palabras_clave?.join(' ') || entidades?.titulo || entidades?.contenido || '';
            if (!query) return { respuesta: `❌ Indica qué nota quieres buscar.`, subflow: null };

            // Listar todos los archivos .md del vault
            let archivos = [];
            try {
                const raw = await client.listarArchivos('');
                archivos  = raw.filter(f => f.type === 'file' && f.name.endsWith('.md'));
            } catch (e) {
                logError(MODULO, 'Error listando archivos GitHub', e);
                return { respuesta: `⚠️ No pude acceder a tu vault. Verifica que el repositorio es accesible.`, subflow: null };
            }

            if (archivos.length === 0) {
                return { respuesta: `🔍 Tu vault está vacío. Aún no hay notas guardadas.`, subflow: null };
            }

            const listaFormateada = archivos
                .map((f, i) => `${i + 1}. ${f.name} (${f.path})`)
                .join('\n');

            // Gemini elige los más relevantes
            const iaResp = await llamarIA(
                `El usuario busca notas relacionadas con: "${query}"

Lista de archivos disponibles (índice. nombre - ruta):
${listaFormateada}

Responde SOLO con JSON: { "indices": [1, 3] }
Los índices (1-based) de los archivos más relevantes, máximo 3.
Si ninguno es relevante, responde: { "indices": [] }`,
                query
            );

            let indices = [];
            try {
                const inicio = iaResp.indexOf('{');
                const fin    = iaResp.lastIndexOf('}');
                if (inicio !== -1 && fin !== -1) {
                    const parsed = JSON.parse(iaResp.slice(inicio, fin + 1));
                    indices = parsed.indices || [];
                }
            } catch (_) { indices = []; }

            if (indices.length === 0) {
                return {
                    respuesta: `🔍 No encontré notas relacionadas con *"${query}"*.\n\nTienes ${archivos.length} nota(s) en tu vault.`,
                    subflow: null
                };
            }

            // Obtener preview de cada nota relevante
            const resultados = [];
            for (const idx of indices.slice(0, 3)) {
                const archivo = archivos[idx - 1];
                if (!archivo) continue;
                try {
                    const contenido = await client.obtenerArchivo(archivo.path);
                    // Tomar primeras 3 líneas no vacías después del frontmatter
                    const lineas = contenido
                        .split('\n')
                        .filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('fecha:') && !l.startsWith('tags:'))
                        .slice(0, 3)
                        .join('\n');
                    resultados.push(`📝 *${archivo.name.replace('.md', '')}*\n${lineas}`);
                } catch (_) {
                    resultados.push(`📝 *${archivo.name.replace('.md', '')}*`);
                }
            }

            return {
                respuesta: `🔍 *PitayaBot — Notas encontradas*\n\n${resultados.join('\n\n─────\n\n')}`,
                subflow: null
            };
        }

        return { respuesta: `⚠️ Intent de notas no reconocido: ${intent}`, subflow: null };

    } catch (err) {
        logError(MODULO, `Error ejecutando ${intent}`, err);
        return { respuesta: `⚠️ Error al ejecutar la acción en tu vault. Intenta de nuevo.`, subflow: null };
    }
}

module.exports = { ejecutar };
