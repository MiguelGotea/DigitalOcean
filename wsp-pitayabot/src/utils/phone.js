'use strict';

/**
 * phone.js — Normalización de números de teléfono WhatsApp
 *
 * WhatsApp entrega JIDs como: 50588112233@c.us o 50588112233@g.us
 * La tabla Operarios guarda el número en el campo telefono_corporativo: 88112233 (país Nicaragua +505)
 * El bot SOLO atiende números corporativos (telefono_corporativo), no celulares personales.
 */

/**
 * Extrae el número local de un JID de WhatsApp.
 * '50588112233@c.us' → '88112233'
 * @param {string} jid
 * @returns {string}
 */
function normalizarNumero(jid) {
    const numero = jid.replace('@c.us', '').replace('@g.us', '');
    // Quitar prefijo 505 (Nicaragua) si está presente
    return numero.startsWith('505') ? numero.slice(3) : numero;
}

/**
 * Formatea un número local al JID completo de WhatsApp para envío.
 * '88112233' → '50588112233@c.us'
 * @param {string} numero  Número local (8 dígitos Nicaragua)
 * @returns {string}
 */
function formatearJID(numero) {
    const limpio = numero.replace(/\D/g, '');
    // Si ya incluye prefijo 505, no agregarlo de nuevo
    const conPrefijo = limpio.startsWith('505') ? limpio : `505${limpio}`;
    return `${conPrefijo}@c.us`;
}

/**
 * Verifica si el mensaje viene de un grupo (no procesar)
 * @param {string} jid
 * @returns {boolean}
 */
function esGrupo(jid) {
    return jid.includes('@g.us');
}

module.exports = { normalizarNumero, formatearJID, esGrupo };
