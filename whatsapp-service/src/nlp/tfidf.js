'use strict';

/**
 * tfidf.js — Motor NLP ligero para el CRM Bot
 * TF-IDF vectorizer + coseno + Naive Bayes simple
 * Sin dependencias externas
 */

// Stopwords en español
const STOPWORDS = new Set([
    'de', 'la', 'el', 'en', 'y', 'a', 'que', 'es', 'no', 'lo', 'un', 'una', 'me', 'te',
    'se', 'su', 'al', 'le', 'para', 'con', 'por', 'los', 'las', 'del', 'más', 'pero',
    'si', 'ya', 'mi', 'fue', 'muy', 'son', 'hay', 'también', 'como', 'este', 'estos',
    'esta', 'estas', 'todo', 'ser', 'tiene', 'tiene', 'puede', 'hacer', 'quiero',
    'necesito', 'favor', 'hola', 'hey', 'ok', 'sí', 'gracias'
]);

/**
 * Normaliza y tokeniza un texto
 */
function tokenizar(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Calcula TF (frecuencia de término en un documento)
 */
function calcularTF(tokens) {
    const tf = {};
    tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const total = tokens.length || 1;
    Object.keys(tf).forEach(t => { tf[t] /= total; });
    return tf;
}

/**
 * Convierta un texto en un vector TF-IDF normalizado
 * @param {string} texto
 * @param {Object} idfMap - { term: idf_score } precalculado
 * @returns {Object} vector { term: weight }
 */
function vectorizar(texto, idfMap = {}) {
    const tokens = tokenizar(texto);
    const tf = calcularTF(tokens);
    const vector = {};
    let magnitud = 0;

    tokens.forEach(t => {
        const idf = idfMap[t] || 1;
        vector[t] = (tf[t] || 0) * idf;
        magnitud += vector[t] ** 2;
    });

    magnitud = Math.sqrt(magnitud) || 1;
    Object.keys(vector).forEach(t => { vector[t] /= magnitud; });
    return vector;
}

/**
 * Similitud coseno entre dos vectores sparse
 */
function similitudCoseno(v1, v2) {
    let dot = 0;
    Object.keys(v1).forEach(t => {
        if (v2[t]) dot += v1[t] * v2[t];
    });
    return dot; // ya normalizados → producto punto = coseno
}

/**
 * Clasifica por keywords — Nivel 4 (fallback simple)
 * @param {string} texto
 * @param {Array} intents — [{ intent_name, keywords, priority }]
 * @returns {{ intent: string, score: number }}
 */
function clasificarKeywords(texto, intents) {
    const tokens = tokenizar(texto);
    let mejorIntent = null;
    let mejorScore = -1;

    intents.forEach(intent => {
        if (!intent.keywords) return;
        const kws = intent.keywords.split(',').map(k => k.trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

        let score = 0;
        // Verificar también el texto completo para keywords de múltiples palabras
        const textoNorm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        kws.forEach(kw => {
            if (textoNorm.includes(kw)) score += intent.priority;
            else tokens.forEach(t => { if (t === kw) score += 1; });
        });

        if (score > mejorScore) {
            mejorScore = score;
            mejorIntent = intent;
        }
    });

    return { intent: mejorIntent, score: mejorScore };
}

/**
 * Naive Bayes simplificado — Nivel 2
 * Usa la distribución de keywords como prior
 * @param {string} texto
 * @param {Array} intents
 * @returns {{ intent, confidence }}
 */
function naiveBayes(texto, intents) {
    const tokens = tokenizar(texto);
    if (tokens.length === 0) return { intent: null, confidence: 0 };

    let mejorIntent = null;
    let mejorScore = -Infinity;
    let totalScore = 0;

    const scores = intents.map(intent => {
        if (!intent.keywords) return { intent, score: 0 };
        const kws = intent.keywords.split(',').map(k =>
            k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        ).filter(Boolean);

        // P(class) como prior uniforme + log probabilidad
        let logProb = Math.log(1 / intents.length);
        tokens.forEach(t => {
            const inKws = kws.includes(t) ? 1 : 0;
            logProb += Math.log((inKws + 0.1) / (kws.length + 0.1 * tokens.length));
        });

        return { intent, score: logProb };
    });

    scores.forEach(({ intent, score }) => {
        totalScore += Math.exp(score);
        if (score > mejorScore) {
            mejorScore = score;
            mejorIntent = intent;
        }
    });

    const confidence = totalScore > 0 ? Math.exp(mejorScore) / totalScore : 0;
    return { intent: mejorIntent, confidence };
}

/**
 * Motor completo de clasificación
 * Nivel 1 (contexto) se maneja externamente
 * @param {string} texto
 * @param {Array} intents — intenciones activas con keywords
 * @param {Array} embeddings — [{ intent_name, vector: {term: weight} }]
 * @returns {{ intent_name, nivel, confidence }}
 */
function clasificar(texto, intents, embeddings = []) {
    if (!texto || !texto.trim()) {
        return { intent_name: 'no_entiendo', nivel: 4, confidence: 0 };
    }

    // Nivel 2 — Naive Bayes
    const nb = naiveBayes(texto, intents);
    if (nb.intent && nb.confidence > 0.70) {
        return { intent_name: nb.intent.intent_name, nivel: 2, confidence: nb.confidence };
    }

    // Nivel 3 — Similitud coseno (TF-IDF embeddings)
    if (embeddings.length > 0) {
        const msgVector = vectorizar(texto);
        let mejorSim = 0;
        let mejorEmb = null;

        embeddings.forEach(emb => {
            const sim = similitudCoseno(msgVector, emb.vector);
            if (sim > mejorSim) {
                mejorSim = sim;
                mejorEmb = emb;
            }
        });

        if (mejorEmb && mejorSim > 0.80) {
            return { intent_name: mejorEmb.intent_name, nivel: 3, confidence: mejorSim };
        }
    }

    // Nivel 4 — Keywords fallback
    const kw = clasificarKeywords(texto, intents);
    if (kw.intent && kw.score > 0) {
        return { intent_name: kw.intent.intent_name, nivel: 4, confidence: kw.score };
    }

    return { intent_name: 'no_entiendo', nivel: 4, confidence: 0 };
}

/**
 * Genera un vector TF-IDF para una intención (para guardarlo en intent_embeddings)
 * @param {string} intent_name
 * @param {string} keywords
 * @param {string[]} sampleResponses — para enriquecer el vocabulario
 * @returns {Object} vector { term: weight }
 */
function generarVectorIntent(intent_name, keywords, sampleResponses = []) {
    const textoBase = [keywords, ...sampleResponses].join(' ');
    return vectorizar(textoBase);
}

module.exports = { clasificar, vectorizar, generarVectorIntent, similitudCoseno, tokenizar };
