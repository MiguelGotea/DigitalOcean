'use strict';

/**
 * crypto.js — Cifrado AES-256-CBC para tokens GitHub
 *
 * La clave vive en process.env.AES_SECRET_KEY (no en BD).
 * El PHP cifra con openssl_encrypt, el VPS descifra aquí.
 *
 * Formato del texto cifrado: "<ivHex>:<cifradoHex>"
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

function getKey() {
    const key = process.env.AES_SECRET_KEY;
    if (!key) throw new Error('AES_SECRET_KEY no está configurada en .env');
    return Buffer.from(key, 'utf8').slice(0, 32);
}

/**
 * Cifra un texto plano y lo retorna como "<ivHex>:<cifradoHex>"
 */
function cifrar(texto) {
    const iv     = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + cifrado.toString('hex');
}

/**
 * Descifra un texto cifrado con formato "<ivHex>:<cifradoHex>"
 * Compatible con openssl_encrypt de PHP en modo CBC.
 */
function descifrar(textoCifrado) {
    if (!textoCifrado || !textoCifrado.includes(':')) {
        throw new Error('Formato de texto cifrado invalido');
    }
    const [ivHex, cifradoHex] = textoCifrado.split(':');
    const iv       = Buffer.from(ivHex, 'hex');
    const cifrado  = Buffer.from(cifradoHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
}

module.exports = { cifrar, descifrar };
