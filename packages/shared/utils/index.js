"use strict";
/**
 * EchoLife Shared Utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUUID = generateUUID;
exports.toISODate = toISODate;
exports.timeDecayScore = timeDecayScore;
exports.cosineSimilarity = cosineSimilarity;
exports.hybridScore = hybridScore;
exports.paginate = paginate;
exports.clamp = clamp;
exports.deepMerge = deepMerge;
exports.retryWithBackoff = retryWithBackoff;
exports.maskEmail = maskEmail;
exports.maskPhone = maskPhone;
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.slugify = slugify;
exports.truncate = truncate;
exports.sleep = sleep;
exports.isNotNil = isNotNil;
exports.groupBy = groupBy;
/** Generate a UUID v4 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/** Format date to ISO string */
function toISODate(date) {
    return new Date(date).toISOString();
}
/** Calculate time decay score (exponential decay) */
function timeDecayScore(createdAt, halfLifeDays = 30) {
    const now = Date.now();
    const created = new Date(createdAt).getTime();
    const ageInDays = (now - created) / (1000 * 60 * 60 * 24);
    return Math.exp(-0.693 * ageInDays / halfLifeDays);
}
/** Calculate cosine similarity between two vectors */
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        throw new Error('Vector dimension mismatch');
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0)
        return 0;
    return dotProduct / denominator;
}
/** Calculate hybrid RAG score */
function hybridScore(semanticScore, recencyScore, emotionScore, weights = {
    semantic: 0.7,
    recency: 0.2,
    emotion: 0.1,
}) {
    return (weights.semantic * semanticScore +
        weights.recency * recencyScore +
        weights.emotion * emotionScore);
}
/** Paginate an array */
function paginate(items, page, pageSize) {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}
/** Clamp a number between min and max */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/** Deep merge objects */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] instanceof Object && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key], source[key]);
        }
        else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
/** Retry an async function with exponential backoff */
async function retryWithBackoff(fn, maxRetries = 3, initialDelayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                const delay = initialDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
/** Mask sensitive data (e.g., email, phone) */
function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!domain)
        return '***';
    const maskedLocal = local.length <= 2 ? '***' : local.slice(0, 2) + '***';
    return `${maskedLocal}@${domain}`;
}
function maskPhone(phone) {
    if (phone.length < 7)
        return '***';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}
/** Validate email format */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
/** Validate phone format (Chinese) */
function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
}
/** Convert string to slug */
function slugify(str) {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
/** Truncate text to a maximum length */
function truncate(text, maxLength, suffix = '...') {
    if (text.length <= maxLength)
        return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
}
/** Sleep for a given number of milliseconds */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Check if a value is not null or undefined */
function isNotNil(value) {
    return value !== null && value !== undefined;
}
/** Group array items by a key */
function groupBy(items, keyFn) {
    return items.reduce((groups, item) => {
        const key = keyFn(item);
        (groups[key] || (groups[key] = [])).push(item);
        return groups;
    }, {});
}
//# sourceMappingURL=index.js.map