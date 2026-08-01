/**
 * EchoLife Shared Constants
 */
import { AgentType } from '../types/enums';

/** API version */
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

/** Default pagination */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** JWT configuration */
export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  ISSUER: 'echolife',
  AUDIENCE: 'echolife-users',
} as const;

/** Redis key prefixes */
export const REDIS_KEYS = {
  RATE_LIMIT: 'rate_limit:',
  REFRESH_TOKEN: 'refresh_token:',
  WORKING_MEMORY: 'working_memory:',
  AGENT_CACHE: 'agent_cache:',
  OTP: 'otp:',
  SESSION: 'session:',
} as const;

/** Redis TTL (seconds) */
export const REDIS_TTL = {
  WORKING_MEMORY: 86400, // 24 hours
  SHORT_CACHE: 300, // 5 minutes
  MEDIUM_CACHE: 3600, // 1 hour
  LONG_CACHE: 86400, // 24 hours
  RATE_LIMIT: 60,
  OTP: 300, // 5 minutes
} as const;

/** AI model configuration */
export const AI_CONFIG = {
  MODEL: 'glm-4-plus',
  EMBEDDING_MODEL: 'embedding-3',
  EMBEDDING_DIM: 1536,
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.7,
  STREAM_TIMEOUT_MS: 60000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

/** RAG retrieval defaults */
export const RAG_DEFAULTS = {
  TOP_K: 10,
  MIN_SIMILARITY: 0.3,
  WEIGHTS: {
    SEMANTIC: 0.7,
    RECENCY: 0.2,
    EMOTION: 0.1,
  },
} as const;

/** pgvector index configuration */
export const VECTOR_INDEX_CONFIG = {
  INDEX_TYPE: 'ivfflat',
  LISTS: 100,
  PROBES: 10,
  DIMENSIONS: 1536,
} as const;

/** Agent metadata */
export const AGENTS: Record<AgentType, { name: string; description: string; maxTokens: number }> = {
  [AgentType.LIFE_COACH]: {
    name: 'Life Coach',
    description: 'Orchestrator agent that routes user input to appropriate sub-agents',
    maxTokens: 2048,
  },
  [AgentType.STORY_AGENT]: {
    name: 'Story Agent',
    description: 'Conducts interviews and generates narrative stories from memories',
    maxTokens: 4096,
  },
  [AgentType.MEMORY_AGENT]: {
    name: 'Memory Agent',
    description: 'Extracts structured memories and performs RAG retrieval',
    maxTokens: 4096,
  },
  [AgentType.EMOTION_AGENT]: {
    name: 'Emotion Agent',
    description: 'Analyzes emotions and generates personality DNA profiles',
    maxTokens: 2048,
  },
  [AgentType.KNOWLEDGE_AGENT]: {
    name: 'Knowledge Agent',
    description: 'Extracts entities and builds knowledge graph',
    maxTokens: 2048,
  },
  [AgentType.SUMMARY_AGENT]: {
    name: 'Summary Agent',
    description: 'Generates periodic life summaries',
    maxTokens: 4096,
  },
  [AgentType.RELATIONSHIP_AGENT]: {
    name: 'Relationship Agent',
    description: 'Manages family memory cross-matching',
    maxTokens: 2048,
  },
};

/** Subscription limits */
export const SUBSCRIPTION_LIMITS = {
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
} as const;

/** File upload constraints */
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
} as const;

/** Personality dimension labels (Big Five) */
export const PERSONALITY_DIMENSIONS = [
  { key: 'openness', label: '开放性', description: '对新经验的开放程度' },
  { key: 'conscientiousness', label: '尽责性', description: '自律和目标导向程度' },
  { key: 'extraversion', label: '外向性', description: '社交活跃和能量获取方式' },
  { key: 'agreeableness', label: '宜人性', description: '合作和同理心倾向' },
  { key: 'neuroticism', label: '神经质', description: '情绪稳定性程度' },
] as const;

/** Emotion categories */
export const EMOTION_CATEGORIES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise',
  'disgust', 'trust', 'anticipation', 'love', 'nostalgia',
  'pride', 'shame', 'guilt', 'envy', 'hope', 'gratitude',
] as const;

/** Shimo (时墨) — the unified family AI companion persona.
 *  All internal agents are hidden behind this identity. */
export const SHIMO_PERSONA = {
  NAME: '时墨',
  AVATAR: '🌿',
  ROLE: '家庭 AI 伴侣',
  WELCOME_MESSAGE: '嗨！我是时墨 🌿 今天想聊点啥？生活琐事、情绪起伏，还是一段想记录下来的回忆？我都在听～',
  CORE_TRAITS: [
    '温暖、有同理心，先接住情绪再聊事情',
    '接地气、有梗，像跟好朋友微信聊天',
    '会主动调用工具和记忆，但不让用户感到机械',
    '永远以「时墨」身份回应，不暴露内部 Agent 名称',
  ],
  /** 童忆引擎叙事风格 — 像小时候公益广告的温暖旁白 */
  KINDNESS_NARRATIVE_STYLE: [
    '短。温暖。有画面感。像小时候电视里那段几十秒的公益广告。',
    '不说教，不升华，让细节自己说话。',
    '记录的不只是画面，而是一家人在一起的时间。',
    '最后一句轻轻点题，像公益广告结束时的旁白。',
  ],
} as const;

/** Agent runtime pipeline constants */
export const AGENT_RUNTIME = {
  MAX_PLAN_STEPS: 5,
  MAX_TOOL_CALLS_PER_TURN: 3,
  MAX_REASONING_STEPS: 3,
  DEFAULT_CHAT_MODEL: 'glm-4-plus',
} as const;
