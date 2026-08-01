/**
 * EchoLife API Client
 *
 * A lightweight fetch-based HTTP client that:
 *  - Injects the JWT access token from localStorage automatically
 *  - Unwraps the unified { code, message, data } response envelope
 *  - Handles 401 by clearing the session and redirecting to /login
 *  - Provides typed convenience methods (get, post, put, patch, delete)
 *  - Exposes createSSEStream() for Server-Sent Events consumption
 */
import { API_PREFIX } from '@echolife/shared';
import type { ApiResponse } from '@echolife/shared';
import { getToken, clearTokens } from './token-storage';

/** Base URL for the backend API. Uses relative path so Next.js rewrites proxy to backend. */
export const API_BASE_URL = '';

/** Full prefix for all versioned API endpoints. */
export const API_ENDPOINT = `${API_BASE_URL}${API_PREFIX}`;

/**
 * SSE streaming uses the same relative path as regular API calls.
 * In production, Nginx handles SSE correctly (proxy_buffering off),
 * so there's no need to bypass it. Using relative path avoids
 * double-prefix issues when NEXT_PUBLIC_API_URL includes the API prefix.
 */
const SSE_ENDPOINT = API_ENDPOINT;

/** Custom error thrown for non-successful API responses. */
export class ApiError extends Error {
  code: number;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: number = -1,
    status: number = 0,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Query parameters are represented as a flat record of stringifiable values. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Convert a query params object into a URL search string (skips empty values). */
function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.append(key, String(value));
  }
  return `?${search.toString()}`;
}

/** Build the full URL for a given endpoint path. */
function buildUrl(endpoint: string, params?: QueryParams): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_ENDPOINT}${path}${buildQueryString(params)}`;
}

/** Merge default headers with caller-supplied headers. */
function buildHeaders(custom?: HeadersInit): Headers {
  const headers = new Headers(custom);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * Handle an authentication failure by clearing the session and redirecting.
 * We avoid redirecting during SSR or if we are already on the login page.
 */
function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  clearTokens();
  const currentPath = window.location.pathname;
  if (currentPath !== '/login' && currentPath !== '/register') {
    window.location.href = '/login';
  }
}

/** Core request executor that unwraps the response envelope. */
async function request<T>(
  method: string,
  endpoint: string,
  options: {
    params?: QueryParams;
    body?: unknown;
    headers?: HeadersInit;
    signal?: AbortSignal;
    raw?: boolean;
  } = {},
): Promise<T> {
  const { params, body, headers, signal, raw } = options;
  const url = buildUrl(endpoint, params);
  const init: RequestInit = {
    method,
    headers: buildHeaders(headers),
    signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(
      '网络连接失败，请检查网络后重试',
      -1,
      0,
    );
  }

  // Handle 401 specifically
  if (response.status === 401) {
    handleUnauthorized();
    throw new ApiError('登录已过期，请重新登录', 40101, 401);
  }

  // For non-JSON responses, return raw if requested
  const contentType = response.headers.get('content-type') ?? '';
  if (raw || !contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(
        `请求失败: ${response.status} ${response.statusText}`,
        -1,
        response.status,
      );
    }
    return response as unknown as T;
  }

  // Parse the unified envelope
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError('响应解析失败', -1, response.status);
  }

  // Some error responses may not include the envelope (e.g. NestJS default)
  if (!response.ok) {
    const message =
      (payload as unknown as { message?: string }).message ??
      `请求失败: ${response.status}`;
    const code =
      (payload as unknown as { code?: number }).code ?? -1;
    throw new ApiError(message, code, response.status, payload as unknown as Record<string, unknown>);
  }

  // code === 0 means success per the backend interceptor
  if (payload.code !== 0) {
    throw new ApiError(payload.message || '请求失败', payload.code, response.status);
  }

  return payload.data;
}

export const apiClient = {
  /** Perform a GET request. */
  get<T>(endpoint: string, params?: QueryParams, signal?: AbortSignal): Promise<T> {
    return request<T>('GET', endpoint, { params, signal });
  },

  /** Perform a POST request. */
  post<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('POST', endpoint, { body, signal });
  },

  /** Perform a PUT request. */
  put<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('PUT', endpoint, { body, signal });
  },

  /** Perform a PATCH request. */
  patch<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('PATCH', endpoint, { body, signal });
  },

  /** Perform a DELETE request. */
  delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return request<T>('DELETE', endpoint, { signal });
  },
};

// ============================================================
// SSE streaming support
// ============================================================

/** Callbacks invoked as SSE events are parsed from the stream. */
export interface SSECallbacks {
  onToken?: (content: string) => void;
  onReasoning?: (content: string) => void;
  onEntities?: (entities: string[]) => void;
  onEmotion?: (emotion: string, intensity: number) => void;
  onSkillExp?: (skillName: string, expGained: number, agentCode: string) => void;
  onSkillLevelUp?: (skillName: string, level: number, agentCode: string) => void;
  onDone?: (data: { memoryId?: string; summary?: string; emotion?: string }) => void;
  onError?: (message: string, code: number) => void;
  onClose?: () => void;
}

/** A handle returned by createSSEStream allowing the stream to be aborted. */
export interface SSEHandle {
  abort: () => void;
}

/**
 * Consume an SSE stream from a POST endpoint (e.g. /ai/chat).
 *
 * The backend sends events in the format:
 *   event: <type>\n
 *   data: <json>\n\n
 *
 * Event types: token, entities, emotion, done, error.
 *
 * Since the native EventSource API only supports GET requests, we use the
 * fetch ReadableStream API to consume the POST response incrementally.
 */
export function createSSEStream(
  endpoint: string,
  body: unknown,
  callbacks: SSECallbacks,
): SSEHandle {
  const controller = new AbortController();
  const url = endpoint.startsWith('/')
    ? `${SSE_ENDPOINT}${endpoint}`
    : `${SSE_ENDPOINT}/${endpoint}`;

  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      callbacks.onError?.('连接AI服务失败，请检查网络', -1);
      callbacks.onClose?.();
      return;
    }

    if (!response.ok || !response.body) {
      if (response.status === 401) {
        handleUnauthorized();
        callbacks.onError?.('登录已过期，请重新登录', 40101);
      } else {
        callbacks.onError?.(`AI服务返回错误: ${response.status}`, response.status);
      }
      callbacks.onClose?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Timeout: if no data received within 60s, abort and show error
    let hasReceivedData = false;
    const timeoutId = setTimeout(() => {
      if (!hasReceivedData) {
        controller.abort();
        callbacks.onError?.('AI响应超时，请稍后重试', -1);
        callbacks.onClose?.();
      }
    }, 60_000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        hasReceivedData = true;
        clearTimeout(timeoutId);
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line (\n\n)
        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          parseSSEEvent(rawEvent, callbacks);
        }
      }
      // Flush any trailing event
      if (buffer.trim()) {
        parseSSEEvent(buffer, callbacks);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError?.('数据流读取中断', -1);
      }
    } finally {
      clearTimeout(timeoutId);
      callbacks.onClose?.();
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

// ============================================================
// 童忆引擎 Kindness API
// ============================================================

/** 温暖瞬间创建参数 */
export interface CreateKindnessParams {
  title: string;
  content: string;
  type?: string;
  importance?: string;
  people?: string[];
  event: string;
  emotion?: string;
  emotionScore?: number;
  location?: string;
  media?: { type: string; url?: string; description?: string }[];
  familyId?: string;
  occurredAt?: string;
}

/** 温暖瞬间查询参数 */
export interface QueryKindnessParams {
  page?: number;
  pageSize?: number;
  type?: string;
  importance?: string;
  emotion?: string;
  familyId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

export const kindnessApi = {
  /** 获取温暖瞬间列表 */
  list: (params?: QueryKindnessParams) =>
    apiClient.get('/kindness', params as QueryParams),

  /** 创建温暖瞬间 */
  create: (data: CreateKindnessParams) =>
    apiClient.post('/kindness', data),

  /** 获取温暖瞬间详情 */
  getById: (id: string) =>
    apiClient.get(`/kindness/${id}`),

  /** 删除温暖瞬间 */
  delete: (id: string) =>
    apiClient.delete(`/kindness/${id}`),

  /** 获取温暖统计 */
  getStats: () =>
    apiClient.get('/kindness/stats'),

  /** 获取 Kindness Network 节点（供 Life Core 粒子云渲染） */
  getNodes: (limit?: number) =>
    apiClient.get('/kindness/nodes', limit ? { limit } : undefined),

  /** AI 重新讲述温暖瞬间（Memory Story Reconstruction） */
  reconstructStory: (id: string) =>
    apiClient.post(`/kindness/${id}/story`),

  /** 从文本识别家庭温暖行为（Family Kindness Moments） */
  detect: (text: string) =>
    apiClient.post('/kindness/detect', { text }),

  /** 生成每日温暖提醒（Daily Warm Reminder） */
  generateDailyReminder: () =>
    apiClient.post('/kindness/reminder/daily'),

  /** 获取待发送的温暖提醒 */
  getPendingReminders: () =>
    apiClient.get('/kindness/reminders/pending'),

  /** 生成家庭短故事（Family Short Story Generator） */
  generateShortStory: (period?: 'daily' | 'weekly') =>
    apiClient.post(`/kindness/story/generate${period ? `?period=${period}` : ''}`),

  /** 获取历史家庭短故事 */
  getShortStories: (page?: number, pageSize?: number) =>
    apiClient.get('/kindness/stories', { page, pageSize }),
};

/** Parse a single raw SSE event block and dispatch to the relevant callback. */
function parseSSEEvent(raw: string, callbacks: SSECallbacks): void {
  let eventType = 'message';
  let dataStr = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('event:')) {
      eventType = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      dataStr += trimmed.slice(5).trim();
    }
  }

  if (!dataStr) return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  switch (eventType) {
    case 'token': {
      const content = data.content as string;
      if (content) callbacks.onToken?.(content);
      break;
    }
    case 'reasoning': {
      const content = data.content as string;
      if (content) callbacks.onReasoning?.(content);
      break;
    }
    case 'entities': {
      const entities = data.entities as string[];
      if (Array.isArray(entities)) callbacks.onEntities?.(entities);
      break;
    }
    case 'emotion': {
      const emotion = data.emotion as string;
      const intensity = (data.intensity as number) ?? 0;
      if (emotion) callbacks.onEmotion?.(emotion, intensity);
      break;
    }
    case 'skill_exp': {
      const skillName = (data.skillName as string) ?? '';
      const expGained = (data.expGained as number) ?? 0;
      const agentCode = (data.agentCode as string) ?? '';
      if (skillName && expGained > 0) callbacks.onSkillExp?.(skillName, expGained, agentCode);
      break;
    }
    case 'skill_level_up': {
      const skillName = (data.skillName as string) ?? '';
      const level = (data.level as number) ?? 0;
      const agentCode = (data.agentCode as string) ?? '';
      if (skillName && level > 0) callbacks.onSkillLevelUp?.(skillName, level, agentCode);
      break;
    }
    case 'done': {
      callbacks.onDone?.({
        memoryId: data.memoryId as string | undefined,
        summary: data.summary as string | undefined,
        emotion: data.emotion as string | undefined,
      });
      break;
    }
    case 'error': {
      const message = (data.message as string) ?? 'AI服务发生错误';
      const code = (data.code as number) ?? -1;
      callbacks.onError?.(message, code);
      break;
    }
    default:
      break;
  }
}

/** SWR fetcher built on top of the api client. */
export const swrFetcher = <T>(endpoint: string): Promise<T> => apiClient.get<T>(endpoint);

/**
 * 创建一个 GET-based SSE 连接（用于微信消息流和 agent 活动流等只读实时推送）。
 *
 * 与 createSSEStream 不同，这里使用 GET 方法 + fetch ReadableStream，
 * 因为后端的 @Sse 端点只接受 GET 请求。
 *
 * 返回一个 abort handle，调用方在卸载时调用 abort() 断开连接。
 */
export function createGETSSEStream(
  endpoint: string,
  onEvent: (eventType: string, data: Record<string, unknown>) => void,
  onError?: (msg: string) => void,
): { abort: () => void } {
  const controller = new AbortController();
  const url = endpoint.startsWith('/')
    ? `${SSE_ENDPOINT}${endpoint}`
    : `${SSE_ENDPOINT}/${endpoint}`;

  const token = getToken();
  const headers: HeadersInit = {
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onError?.('实时连接失败');
      return;
    }

    if (!response.ok || !response.body) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      onError?.(`连接错误: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          // 解析 SSE 事件
          let eventType = 'message';
          let dataStr = '';
          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('event:')) {
              eventType = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              dataStr += trimmed.slice(5).trim();
            }
          }
          if (!dataStr || dataStr === 'ping') continue;
          try {
            const data = JSON.parse(dataStr);
            onEvent(eventType, data);
          } catch {
            // 非 JSON 数据，跳过
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.('数据流中断');
      }
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}
