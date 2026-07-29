/**
 * EchoLife Shared API Types
 * Unified response format and error definitions
 */

/** Unified API response wrapper */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Error response */
export interface ErrorResponse {
  code: number;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  traceId?: string;
}

/** SSE event types for AI streaming */
export enum SSEEventType {
  TOKEN = 'token',
  ENTITIES = 'entities',
  EMOTION = 'emotion',
  DONE = 'done',
  ERROR = 'error',
  SKILL_EXP = 'skill_exp',
  SKILL_LEVEL_UP = 'skill_level_up',
  REASONING = 'reasoning',
  TOOL_CALL = 'tool_call',
  OBSERVATION = 'observation',
  ACTION = 'action',
  WORKFLOW_STEP = 'workflow_step',
}

/** SSE token event data */
export interface SSETokenData {
  content: string;
}

/** SSE entities event data */
export interface SSEEntitiesData {
  entities: string[];
}

/** SSE emotion event data */
export interface SSEEmotionData {
  emotion: string;
  intensity: number;
}

/** SSE done event data */
export interface SSEDoneData {
  memoryId: string;
  summary: string;
  emotion?: string;
}

/** SSE error event data */
export interface SSEErrorData {
  message: string;
  code: number;
}

/** SSE skill experience gain event data */
export interface SSESkillExpData {
  skillName: string;
  expGained: number;
  agentCode: string;
}

/** SSE skill level-up event data */
export interface SSESkillLevelUpData {
  skillName: string;
  level: number;
  agentCode: string;
}

/** SSE reasoning event data (chain-of-thought step) */
export interface SSEReasoningData {
  step: number;
  content: string;
}

/** SSE tool_call event data (structured tool invocation) */
export interface SSEToolCallData {
  tool: string;
  args: Record<string, unknown>;
}

/** SSE observation event data (tool/workflow result fed back) */
export interface SSEObservationData {
  source: string;
  success: boolean;
  summary: string;
  data?: unknown;
}

/** SSE action event data (side-effect execution) */
export interface SSEActionData {
  action: string;
  status: 'running' | 'success' | 'failed';
  detail?: string;
}

/** SSE workflow_step event data */
export interface SSEWorkflowStepData {
  workflow: string;
  step: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
}

/** Discriminated union for all SSE events streamed to the client */
export type SSEEvent =
  | { type: SSEEventType.TOKEN; data: SSETokenData }
  | { type: SSEEventType.ENTITIES; data: SSEEntitiesData }
  | { type: SSEEventType.EMOTION; data: SSEEmotionData }
  | { type: SSEEventType.DONE; data: SSEDoneData }
  | { type: SSEEventType.ERROR; data: SSEErrorData }
  | { type: SSEEventType.SKILL_EXP; data: SSESkillExpData }
  | { type: SSEEventType.SKILL_LEVEL_UP; data: SSESkillLevelUpData }
  | { type: SSEEventType.REASONING; data: SSEReasoningData }
  | { type: SSEEventType.TOOL_CALL; data: SSEToolCallData }
  | { type: SSEEventType.OBSERVATION; data: SSEObservationData }
  | { type: SSEEventType.ACTION; data: SSEActionData }
  | { type: SSEEventType.WORKFLOW_STEP; data: SSEWorkflowStepData };

/** Standard error code ranges */
export const ERROR_CODES = {
  // 400xx - Validation errors
  VALIDATION_ERROR: 40001,
  INVALID_PARAMS: 40002,
  MISSING_FIELD: 40003,
  INVALID_FILE: 40004,

  // 401xx - Authentication errors
  UNAUTHORIZED: 40101,
  TOKEN_EXPIRED: 40102,
  TOKEN_INVALID: 40103,
  REFRESH_TOKEN_EXPIRED: 40104,

  // 403xx - Authorization errors
  FORBIDDEN: 40301,
  INSUFFICIENT_PERMISSIONS: 40302,
  ACCOUNT_SUSPENDED: 40303,

  // 404xx - Not found errors
  NOT_FOUND: 40401,
  USER_NOT_FOUND: 40402,
  MEMORY_NOT_FOUND: 40403,
  RESOURCE_NOT_FOUND: 40404,

  // 409xx - Conflict errors
  CONFLICT: 40901,
  EMAIL_ALREADY_EXISTS: 40902,
  PHONE_ALREADY_EXISTS: 40903,

  // 422xx - Business logic errors
  QUOTA_EXCEEDED: 42201,
  SUBSCRIPTION_EXPIRED: 42202,
  CAPSULE_SEALED: 42203,
  INTERVIEW_COMPLETED: 42204,

  // 429xx - Rate limit errors
  RATE_LIMITED: 42901,
  TOO_MANY_REQUESTS: 42902,

  // 500xx - Server errors
  INTERNAL_ERROR: 50001,
  DATABASE_ERROR: 50002,
  AI_SERVICE_ERROR: 50003,
  AI_TIMEOUT: 50004,
  EMBEDDING_ERROR: 50005,

  // 503xx - Service unavailable
  SERVICE_UNAVAILABLE: 50301,
  MAINTENANCE_MODE: 50302,
} as const;

/** HTTP status code mapping */
export const HTTP_STATUS: Record<number, number> = {
  40001: 400,
  40002: 400,
  40003: 400,
  40004: 400,
  40101: 401,
  40102: 401,
  40103: 401,
  40104: 401,
  40301: 403,
  40302: 403,
  40303: 403,
  40401: 404,
  40402: 404,
  40403: 404,
  40404: 404,
  40901: 409,
  40902: 409,
  40903: 409,
  42201: 422,
  42202: 422,
  42203: 422,
  42204: 422,
  42901: 429,
  42902: 429,
  50001: 500,
  50002: 500,
  50003: 500,
  50004: 500,
  50005: 500,
  50301: 503,
  50302: 503,
};
