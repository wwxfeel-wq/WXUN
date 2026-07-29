"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTION_CATEGORIES = exports.PERSONALITY_DIMENSIONS = exports.FILE_UPLOAD = exports.SUBSCRIPTION_LIMITS = exports.AGENTS = exports.VECTOR_INDEX_CONFIG = exports.RAG_DEFAULTS = exports.AI_CONFIG = exports.REDIS_TTL = exports.REDIS_KEYS = exports.JWT_CONFIG = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.API_PREFIX = exports.API_VERSION = void 0;
/**
 * EchoLife Shared Constants
 */
const enums_1 = require("../types/enums");
/** API version */
exports.API_VERSION = 'v1';
exports.API_PREFIX = `/api/${exports.API_VERSION}`;
/** Default pagination */
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
/** JWT configuration */
exports.JWT_CONFIG = {
    ACCESS_TOKEN_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    ISSUER: 'echolife',
    AUDIENCE: 'echolife-users',
};
/** Redis key prefixes */
exports.REDIS_KEYS = {
    RATE_LIMIT: 'rate_limit:',
    REFRESH_TOKEN: 'refresh_token:',
    WORKING_MEMORY: 'working_memory:',
    AGENT_CACHE: 'agent_cache:',
    OTP: 'otp:',
    SESSION: 'session:',
};
/** Redis TTL (seconds) */
exports.REDIS_TTL = {
    WORKING_MEMORY: 86400, // 24 hours
    SHORT_CACHE: 300, // 5 minutes
    MEDIUM_CACHE: 3600, // 1 hour
    LONG_CACHE: 86400, // 24 hours
    RATE_LIMIT: 60,
    OTP: 300, // 5 minutes
};
/** AI model configuration */
exports.AI_CONFIG = {
    MODEL: 'glm-4-plus',
    EMBEDDING_MODEL: 'embedding-3',
    EMBEDDING_DIM: 1536,
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.7,
    STREAM_TIMEOUT_MS: 60000,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};
/** RAG retrieval defaults */
exports.RAG_DEFAULTS = {
    TOP_K: 10,
    MIN_SIMILARITY: 0.3,
    WEIGHTS: {
        SEMANTIC: 0.7,
        RECENCY: 0.2,
        EMOTION: 0.1,
    },
};
/** pgvector index configuration */
exports.VECTOR_INDEX_CONFIG = {
    INDEX_TYPE: 'ivfflat',
    LISTS: 100,
    PROBES: 10,
    DIMENSIONS: 1536,
};
/** Agent metadata */
exports.AGENTS = {
    [enums_1.AgentType.LIFE_COACH]: {
        name: 'Life Coach',
        description: 'Orchestrator agent that routes user input to appropriate sub-agents',
        maxTokens: 2048,
    },
    [enums_1.AgentType.STORY_AGENT]: {
        name: 'Story Agent',
        description: 'Conducts interviews and generates narrative stories from memories',
        maxTokens: 4096,
    },
    [enums_1.AgentType.MEMORY_AGENT]: {
        name: 'Memory Agent',
        description: 'Extracts structured memories and performs RAG retrieval',
        maxTokens: 4096,
    },
    [enums_1.AgentType.EMOTION_AGENT]: {
        name: 'Emotion Agent',
        description: 'Analyzes emotions and generates personality DNA profiles',
        maxTokens: 2048,
    },
    [enums_1.AgentType.KNOWLEDGE_AGENT]: {
        name: 'Knowledge Agent',
        description: 'Extracts entities and builds knowledge graph',
        maxTokens: 2048,
    },
    [enums_1.AgentType.SUMMARY_AGENT]: {
        name: 'Summary Agent',
        description: 'Generates periodic life summaries',
        maxTokens: 4096,
    },
    [enums_1.AgentType.RELATIONSHIP_AGENT]: {
        name: 'Relationship Agent',
        description: 'Manages family memory cross-matching',
        maxTokens: 2048,
    },
};
/** Subscription limits */
exports.SUBSCRIPTION_LIMITS = {
    free: {
        monthlyAIMessages: 50,
        maxMemories: 100,
        maxInterviews: 5,
        maxCapsules: 3,
        canShareFamily: false,
    },
    pro: {
        monthlyAIMessages: 1000,
        maxMemories: 10000,
        maxInterviews: 100,
        maxCapsules: 50,
        canShareFamily: false,
    },
    family: {
        monthlyAIMessages: 5000,
        maxMemories: 50000,
        maxInterviews: 500,
        maxCapsules: 200,
        canShareFamily: true,
    },
    lifetime: {
        monthlyAIMessages: Infinity,
        maxMemories: Infinity,
        maxInterviews: Infinity,
        maxCapsules: Infinity,
        canShareFamily: true,
    },
};
/** File upload constraints */
exports.FILE_UPLOAD = {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};
/** Personality dimension labels (Big Five) */
exports.PERSONALITY_DIMENSIONS = [
    { key: 'openness', label: '开放性', description: '对新经验的开放程度' },
    { key: 'conscientiousness', label: '尽责性', description: '自律和目标导向程度' },
    { key: 'extraversion', label: '外向性', description: '社交活跃和能量获取方式' },
    { key: 'agreeableness', label: '宜人性', description: '合作和同理心倾向' },
    { key: 'neuroticism', label: '神经质', description: '情绪稳定性程度' },
];
/** Emotion categories */
exports.EMOTION_CATEGORIES = [
    'joy', 'sadness', 'anger', 'fear', 'surprise',
    'disgust', 'trust', 'anticipation', 'love', 'nostalgia',
    'pride', 'shame', 'guilt', 'envy', 'hope', 'gratitude',
];
//# sourceMappingURL=index.js.map