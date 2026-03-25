'use strict';

/**
 * githubClient.js — Wrapper para GitHub Contents API REST (sin dependencias extra)
 *
 * @example
 *   const client = new GitHubClient(token, 'MiguelGotea', 'mi-vault', 'main', 'Notas');
 *   await client.crearNota('Trabajo', 'reunion.md', contenidoMarkdown);
 */

const https = require('https');

class GitHubClient {
    /**
     * @param {string} token          GitHub PAT (ya descifrado)
     * @param {string} owner          Propietario del repo
     * @param {string} repo           Nombre del repo
     * @param {string} [branch=main]  Rama objetivo
     * @param {string} [vaultFolder]  Subcarpeta raíz (opcional)
     */
    constructor(token, owner, repo, branch = 'main', vaultFolder = '') {
        this.token       = (token || '').trim();
        this.owner       = owner;
        this.repo        = repo;
        this.branch      = branch;
        this.vaultFolder = vaultFolder;
    }

    /**
     * Construye la ruta dentro del repo concatenando vaultFolder + carpeta + nombre.
     */
    _buildPath(...partes) {
        return [this.vaultFolder, ...partes].filter(Boolean).join('/');
    }

    /**
     * Crea o actualiza un archivo .md en el vault.
     * Si el archivo ya existe, obtiene el SHA para hacer un PUT de actualización.
     */
    async crearNota(carpeta, nombreArchivo, contenido) {
        const path = this._buildPath(carpeta, nombreArchivo);
        const url  = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;

        // Obtener SHA del archivo si ya existe (para actualización)
        let sha = null;
        try {
            const existente = await this._request('GET', url);
            sha = existente.sha;
        } catch (_) { /* archivo nuevo, sha = null */ }

        const body = {
            message: `PitayaBot: ${sha ? 'actualizar' : 'crear'} nota`,
            content: Buffer.from(contenido, 'utf8').toString('base64'),
            branch:  this.branch,
            ...(sha && { sha })
        };

        return this._request('PUT', url, body);
    }

    /**
     * Lista todos los archivos en una carpeta del vault.
     * @param {string} [carpeta=''] Carpeta dentro del vault
     */
    async listarArchivos(carpeta = '') {
        const path = this._buildPath(carpeta);
        const url  = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
        const data = await this._request('GET', url);
        // Si es un directorio, retorna array; si es un archivo, retorna objeto → normalizar
        return Array.isArray(data) ? data : [data];
    }

    /**
     * Obtiene y decodifica el contenido de un archivo específico.
     * @param {string} rutaCompleta Ruta completa dentro del repo (incluyendo vaultFolder)
     */
    async obtenerArchivo(rutaCompleta) {
        const url  = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${rutaCompleta}`;
        const data = await this._request('GET', url);
        return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }

    // ─────────────── HTTP helpers ───────────────

    _request(method, url, body = null) {
        return new Promise((resolve, reject) => {
            const urlObj  = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path:     urlObj.pathname + urlObj.search,
                method,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept':        'application/vnd.github.v3+json',
                    'User-Agent':    'PitayaBot/1.0',
                    'Content-Type':  'application/json'
                }
            };

            const req = https.request(options, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end',  () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            return reject(new Error(`GitHub API ${res.statusCode}: ${parsed.message || data}`));
                        }
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error('GitHub API: respuesta no es JSON válido'));
                    }
                });
            });

            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }
}

module.exports = GitHubClient;
