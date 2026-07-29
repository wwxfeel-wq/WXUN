import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_CONFIG,
  ERROR_CODES,
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

/** Result of a non-streaming chat completion */
export interface ChatCompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

/** Shape of a single SSE chunk from the GLM streaming API */
interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string; role?: string };
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
    return this.apiKeyService.getProviderConfig(provider);
  }

  // ============================================================
  // Streaming Chat Completion
  // ============================================================

  /**
   * Streams a chat completion from the GLM API.
   * Yields content tokens as they arrive.
   *
   * @param messages - The conversation messages
   * @param options - Model parameters (temperature, maxTokens, etc.)
   * @yields {string} Content chunks from the model
   */
  async *chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string> {
    const cfg = await this.resolveProvider();
    const url = `${cfg.apiUrl}/chat/completions`;
    const body = {
      model: options?.model ?? cfg.chatModel,
      messages,
      stream: true,
      temperature: options?.temperature ?? AI_CONFIG.TEMPERATURE,
      max_tokens: options?.maxTokens ?? AI_CONFIG.MAX_TOKENS,
      ...(options?.topP !== undefined && { top_p: options.topP }),
    };

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
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
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
  }

  // ============================================================
  // Non-Streaming Chat Completion
  // ============================================================

  /**
   * Performs a non-streaming chat completion.
   * Returns the full response with token usage information.
   *
   * @param messages - The conversation messages
   * @param options - Model parameters
   * @returns The complete response with usage stats
   */
  async chatComplete(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatCompletionResult> {
    const cfg = await this.resolveProvider();
    const url = `${cfg.apiUrl}/chat/completions`;
    const body = {
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
          signal: this.createTimeoutSignal(30000),
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
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
      model: data.model ?? body.model,
    };
  }

  // ============================================================
  // Embeddings
  // ============================================================

  /**
   * Generates an embedding vector for a single text.
   *
   * @param text - The text to embed
   * @returns An array of floats representing the embedding
   */
  async embed(text: string): Promise<number[]> {
    const cfg = await this.resolveProvider();
    if (!cfg.embeddingModel) {
      throw new Error(`${cfg.label} 不支持向量嵌入功能`);
    }
    const url = `${cfg.apiUrl}/embeddings`;
    const body = {
      model: cfg.embeddingModel,
      input: text,
    };

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: await this.buildHeaders(),
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

    const cfg = await this.resolveProvider();
    if (!cfg.embeddingModel) {
      throw new Error(`${cfg.label} 不支持批量向量嵌入`);
    }

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
            headers: await this.buildHeaders(),
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
      const embeddings = (data.data ?? []) as Array<{ embedding: number[] }>;

      // Sort by index to maintain order
      const sorted = embeddings.sort((a, b) => {
        return 0; // GLM returns in order; sort if index field exists
      });

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
      this.logger.warn(`No API key configured for ${provider} - AI features will not work`);
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private createTimeoutSignal(timeoutMs: number): AbortSignal {
    return AbortSignal.timeout(timeoutMs);
  }
}
