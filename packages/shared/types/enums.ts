/**
 * EchoLife Shared Enums
 * Used by both frontend and backend
 */

/** User account status */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

/** Subscription plan tier */
export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  FAMILY = 'family',
  LIFETIME = 'lifetime',
}

/** Subscription status */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PAST_DUE = 'past_due',
}

/** RBAC roles */
export enum RoleName {
  SUPER_ADMIN = 'super_admin',
  OPERATOR = 'operator',
  SUPPORT = 'support',
  FINANCE = 'finance',
  AUDITOR = 'auditor',
  USER = 'user',
}

/** Memory type classification */
export enum MemoryType {
  STORY = 'story',
  EVENT = 'event',
  RELATIONSHIP = 'relationship',
  EMOTION = 'emotion',
  ACHIEVEMENT = 'achievement',
  REFLECTION = 'reflection',
  DAILY = 'daily',
}

/** Memory visibility level */
export enum MemoryVisibility {
  PRIVATE = 'private',
  FAMILY = 'family',
  PUBLIC = 'public',
}

/** Interview session status */
export enum InterviewStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

/** Message sender type */
export enum MessageSender {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system',
}

/** Life tree node type */
export enum LifeTreeNodeType {
  ROOT = 'root',
  CATEGORY = 'category',
  EVENT = 'event',
  PERSON = 'person',
  PLACE = 'place',
  THEME = 'theme',
}

/** Time capsule status */
export enum CapsuleStatus {
  SEALED = 'sealed',
  OPENED = 'opened',
  EXPIRED = 'expired',
}

/** Time capsule type */
export enum CapsuleType {
  PERSONAL = 'personal',
  FAMILY = 'family',
  PUBLIC = 'public',
}

/** Summary period type */
export enum SummaryPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/** Notification type */
export enum NotificationType {
  INTERVIEW_REMINDER = 'interview_reminder',
  CAPSULE_OPENING = 'capsule_opening',
  FAMILY_MEMORY = 'family_memory',
  SUMMARY_READY = 'summary_ready',
  SYSTEM = 'system',
}

/** AI Agent type */
export enum AgentType {
  LIFE_COACH = 'life_coach',
  STORY_AGENT = 'story_agent',
  MEMORY_AGENT = 'memory_agent',
  EMOTION_AGENT = 'emotion_agent',
  KNOWLEDGE_AGENT = 'knowledge_agent',
  SUMMARY_AGENT = 'summary_agent',
  RELATIONSHIP_AGENT = 'relationship_agent',
}

/** Prompt version status */
export enum PromptStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/** Knowledge entity type */
export enum EntityType {
  PERSON = 'person',
  PLACE = 'place',
  ORGANIZATION = 'organization',
  EVENT = 'event',
  CONCEPT = 'concept',
  OBJECT = 'object',
}

/** Knowledge relation type */
export enum RelationType {
  RELATED_TO = 'related_to',
  PART_OF = 'part_of',
  MEMBER_OF = 'member_of',
  LOCATED_AT = 'located_at',
  OCCURRED_AT = 'occurred_at',
  CREATED_BY = 'created_by',
}

/** Family member role */
export enum FamilyRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/** Family memory confirmation status */
export enum ConfirmationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
}

/** AI call status */
export enum AICallStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
}

// ─── Childhood Memory Engine (童忆引擎) ──────────────────────

/** 温暖瞬间类型 — 家庭陪伴行为的分类 */
export enum KindnessType {
  /** 陪伴行为（一起吃饭、旅行、散步） */
  COMPANIONSHIP = 'companionship',
  /** 关心行为（准备早餐、叮嘱添衣、照顾生病） */
  CARE = 'care',
  /** 庆祝时刻（生日、节日、纪念日） */
  CELEBRATION = 'celebration',
  /** 成长记录（孩子第一次走路、获奖、毕业） */
  GROWTH = 'growth',
  /** 情感支持（安慰、鼓励、倾听） */
  SUPPORT = 'support',
}

/** 温暖瞬间重要度等级 — 影响 Life Core 粒子颜色 */
export enum KindnessLevel {
  /** 普通温暖节点 — 暖黄色 */
  WARM = 'warm',
  /** 家庭事件 — 绿色 */
  FAMILY = 'family',
  /** 童年温暖节点 — 暖黄色 */
  CHILDHOOD = 'childhood',
  /** 重要家庭瞬间 — 金色核心 */
  GOLDEN = 'golden',
}

/** 童忆引擎 Agent 类型 */
export enum KindnessAgentType {
  /** 记忆故事 Agent — 整理家庭故事 */
  MEMORY_STORY = 'memory_story',
  /** 温暖发现 Agent — 发现家庭温暖行为 */
  KINDNESS = 'kindness',
  /** 陪伴提醒 Agent — 主动陪伴提醒 */
  COMPANION = 'companion',
}
