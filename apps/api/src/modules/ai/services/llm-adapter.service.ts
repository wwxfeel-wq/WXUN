import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_CONFIG,
} from '@echolife/shared';
import { retryWithBackoff } from '@echolife/shared';
import { ApiKeyService } from './api-key.service';

/** Chat message in OpenAI-compatible format */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for chat completion */
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * A single chunk from the streaming chat API.
 * DeepSeek V4 thinking mode emits `reasoning` chunks first (chain-of-thought),
 * followed by `content` chunks (the final answer).
 */
export interface ChatStreamChunk {
  /** 'reasoning' = chain-of-thought (thinking mode), 'content' = final answer */
  type: 'reasoning' | 'content';
  /** The text content of this chunk */
  content: string;
}

/** Result of a non-streaming chat completion */
export interface ChatCompletionResult {
  content: string;
  /** Chain-of-thought reasoning (if thinking mode is active) */
  reasoning?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

/** Shape of a single SSE chunk from the streaming API */
interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
      /** DeepSeek V4 thinking mode: chain-of-thought reasoning content */
      reasoning_content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

@Injectable()
export class LlmAdapterService {
  private readonly logger = new Logger(LlmAdapterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /** Resolve the active provider's config (API URL, models) */
  private async resolveProvider() {
    const provider = await this.apiKeyService.getActiveProvider();
    const cfg = this.apiKeyService.getProviderConfig(provider);
    this.logger.log(`Active AI provider: ${provider} (${cfg.label}), API URL: ${cfg.apiUrl}, model: ${cfg.chatModel}`);
    return { provider, cfg };
  }

  // ============================================================
  // Streaming Chat Completion
  // ============================================================

  /**
   * Streams a chat completion from the AI provider.
   *
   * For DeepSeek V4-Pro (thinking mode), yields two types of chunks:
   *  1. `{ type: 'reasoning', content: '...' }` — chain-of-thought reasoning
   *  2. `{ type: 'content', content: '...' }` — the final answer
   *
   * The caller (e.g. OpenClawProvider.streamResponse) can forward reasoning
   * as a REASONING SSE event and content as TOKEN SSE events, so the
   * frontend can show "时墨正在深度思考..." while the model reasons.
   *
   * @param messages - The conversation messages
   * @param options - Model parameters (temperature, maxTokens, etc.)
   * @yields {ChatStreamChunk} Reasoning or content chunks from the model
   */
  async *chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatStreamChunk> {
    const { provider, cfg } = await this.resolveProvider();
    const url = `${cfg.apiUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model: options?.model ?? cfg.chatModel,
      messages,
      stream: true,
      temperature: options?.temperature ?? AI_CONFIG.TEMPERATURE,
      max_tokens: options?.maxTokens ?? AI_CONFIG.MAX_TOKENS,
      ...(options?.topP !== undefined && { top_p: options.topP }),
    };

    // Note: DeepSeek V4 thinking mode is enabled by default.
    // We keep it enabled and handle reasoning_content in the stream.
    // Thinking mode ignores temperature/top_p (no error, just no effect).

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.buildHeaders(),
      body: JSON.stringify(body),
      signal: this.createTimeoutSignal(AI_CONFIG.STREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`${cfg.label} chat API error: ${response.status} - ${errorText}`);
      throw new Error(`${cfg.label} API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error(`${cfg.label} API returned empty response body`);
    }

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasReasoning = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (separated by double newlines)
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            return;
          }

          try {
            const chunk: StreamChunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            // DeepSeek V4 thinking mode: reasoning_content comes first
            const reasoning = delta?.reasoning_content;
            if (reasoning) {
              hasReasoning = true;
              yield { type: 'reasoning', content: reasoning };
            }

            // Final answer content
            const content = delta?.content;
            if (content) {
              yield { type: 'content', content };
            }
          } catch {
            // Skip malformed JSON chunks
            this.logger.debug(`Skipping malformed SSE chunk: ${data.slice(0, 100)}`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (hasReasoning) {
      this.logger.debug(`${cfg.label} thinking mode: reasoning streamed successfully`);
    }
  }

  // ============================================================
  // Non-Streaming Chat Completion
  // ============================================================

  /**
   * Performs a non-streaming chat completion.
   * Returns the full response with token usage information.
   *
   * For DeepSeek V4 thinking mode, the response includes both
   * `content` (final answer) and `reasoning` (chain-of-thought).
   *
   * @param messages - The conversation messages
   * @param options - Model parameters
   * @returns The complete response with usage stats
   */
  async chatComplete(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatCompletionResult> {
    const { provider, cfg } = await this.resolveProvider();
    const url = `${cfg.apiUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model: options?.model ?? cfg.chatModel,
      messages,
      stream: false,
      temperature: options?.temperature ?? AI_CONFIG.TEMPERATURE,
      max_tokens: options?.maxTokens ?? AI_CONFIG.MAX_TOKENS,
      ...(options?.topP !== undefined && { top_p: options.topP }),
    };

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: await this.buildHeaders(),
          body: JSON.stringify(body),
          signal: this.createTimeoutSignal(60000),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${cfg.label} API error (${res.status}): ${errorText}`);
        }

        return res;
      },
      AI_CONFIG.MAX_RETRIES,
      AI_CONFIG.RETRY_DELAY_MS,
    );

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      reasoning: data.choices?.[0]?.message?.reasoning_content,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
      model: data.model ?? (body.model as string),
    };
  }

  // ============================================================
  // Embeddings
  // ============================================================

  /**
   * Resolve a provider that supports embeddings.
   * If the active chat provider supports embeddings, use it.
   * Otherwise, scan all providers for one with a valid key + embedding support.
   */
  private async resolveEmbeddingProvider() {
    const activeProvider = await this.apiKeyService.getActiveProvider();
    const activeCfg = this.apiKeyService.getProviderConfig(activeProvider);
    if (activeCfg.embeddingModel) {
      const key = await this.apiKeyService.getApiKey(activeProvider);
      if (key) return { provider: activeProvider, cfg: activeCfg, apiKey: key };
    }
    // Fallback: find any provider with embedding support + valid key
    for (const p of ['glm', 'openai', 'qwen'] as const) {
      const cfg = this.apiKeyService.getProviderConfig(p);
      if (cfg.embeddingModel) {
        const key = await this.apiKeyService.getApiKey(p);
        if (key) {
          this.logger.log(`Embedding fallback: using ${p} (${cfg.label}) instead of ${activeProvider}`);
          return { provider: p, cfg, apiKey: key };
        }
      }
    }
    throw new Error('没有可用的嵌入模型 provider，请配置 GLM/OpenAI/Qwen 的 API Key');
  }

  /**
   * Generates an embedding vector for a single text.
   *
   * @param text - The text to embed
   * @returns An array of floats representing the embedding
   */
  async embed(text: string): Promise<number[]> {
    const { cfg, apiKey } = await this.resolveEmbeddingProvider();
    const url = `${cfg.apiUrl}/embeddings`;
    const body = {
      model: cfg.embeddingModel,
      input: text,
    };

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: this.createTimeoutSignal(30000),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${cfg.label} embedding API error (${res.status}): ${errorText}`);
        }

        return res;
      },
      AI_CONFIG.MAX_RETRIES,
      AI_CONFIG.RETRY_DELAY_MS,
    );

    const data = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error(`${cfg.label} embedding API returned invalid embedding data`);
    }

    return embedding as number[];
  }

  /**
   * Generates embeddings for a batch of texts.
   * Processes in chunks to avoid API limits.
   *
   * @param texts - Array of texts to embed
   * @param batchSize - Number of texts per API call (default 16)
   * @returns Array of embedding vectors
   */
  async embedBatch(texts: string[], batchSize: number = 16): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { cfg, apiKey } = await this.resolveEmbeddingProvider();

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const url = `${cfg.apiUrl}/embeddings`;
      const body = {
        model: cfg.embeddingModel,
        input: batch,
      };

      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: this.createTimeoutSignal(60000),
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`${cfg.label} embedding batch API error (${res.status}): ${errorText}`);
          }

          return res;
        },
        AI_CONFIG.MAX_RETRIES,
        AI_CONFIG.RETRY_DELAY_MS,
      );

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[]; index?: number }>;
      };
      const embeddings = (data.data ?? []) as Array<{ embedding: number[]; index?: number }>;

      // Sort by index to maintain order
      const sorted = embeddings.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      for (const item of sorted) {
        if (item.embedding && Array.isArray(item.embedding)) {
          results.push(item.embedding);
        }
      }
    }

    return results;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private async buildHeaders(): Promise<Record<string, string>> {
    const provider = await this.apiKeyService.getActiveProvider();
    const apiKey = await this.apiKeyService.getApiKey(provider);
    if (!apiKey) {
      const cfg = this.apiKeyService.getProviderConfig(provider);
      this.logger.error(
        `No API key configured for ${provider} (${cfg.label}). ` +
        `Set ${cfg.envKey} in .env.production or configure it via the admin settings page. ` +
        `Checked env: ${this.configService.get<string>(cfg.envKey) ? 'set' : 'not set'}`,
      );
      throw new Error(
        `AI 服务未正确配置：${cfg.label} 的 API Key 为空。` +
        `请在 .env.production 中设置 ${cfg.envKey}，或在管理后台 → AI 设置中配置。`,
      );
    }
    this.logger.debug(`Using API key for ${provider}: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private createTimeoutSignal(timeoutMs: number): AbortSignal {
    return AbortSignal.timeout(timeoutMs);
  }
}
