import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmAdapterService } from './llm-adapter.service';
import { LocalEmbeddingService } from './local-embedding.service';
import {
  AI_CONFIG,
  retryWithBackoff,
} from '@echolife/shared';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly prisma: PrismaService,
    private readonly localEmbedding: LocalEmbeddingService,
  ) {}

  /**
   * Generates an embedding vector for a single text.
   *
   * @param text - The text to embed
   * @returns An array of floats (1536 dimensions) representing the embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.llmAdapter.embed(text);
  }

  /**
   * Stores an embedding vector for a memory in the MemoryEmbedding table.
   * Uses raw SQL because Prisma does not natively support the pgvector type.
   * If an embedding already exists for the memory, it is updated.
   *
   * @param memoryId - The UUID of the memory
   * @param embedding - The embedding vector
   * @param model - The embedding model name (defaults to AI_CONFIG.EMBEDDING_MODEL)
   */
  async storeEmbedding(
    memoryId: string,
    embedding: number[],
    model?: string,
  ): Promise<void> {
    const effectiveModel = model ?? this.localEmbedding.modelName;
    const vectorStr = `[${embedding.join(',')}]`;

    await retryWithBackoff(
      async () => {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "memory_embeddings" ("memory_id", "embedding", "model", "created_at")
           VALUES ($1::uuid, $2::vector, $3, NOW())
           ON CONFLICT ("memory_id")
           DO UPDATE SET "embedding" = $2::vector, "model" = $3`,
          memoryId,
          vectorStr,
          effectiveModel,
        );
      },
      AI_CONFIG.MAX_RETRIES,
      AI_CONFIG.RETRY_DELAY_MS,
    );

    this.logger.debug(`Embedding stored for memory: ${memoryId}`);
  }

  /**
   * Generates embeddings for a batch of texts with automatic retry.
   *
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors, one per input text
   */
  async batchEmbed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    return retryWithBackoff(
      () => this.llmAdapter.embedBatch(texts),
      AI_CONFIG.MAX_RETRIES,
      AI_CONFIG.RETRY_DELAY_MS,
    );
  }

  /**
   * Generates and stores embeddings for multiple memories in a batch.
   * Useful for backfilling embeddings when memories are created.
   *
   * @param memories - Array of { id, content } pairs
   */
  async batchGenerateAndStore(
    memories: Array<{ id: string; content: string }>,
  ): Promise<void> {
    if (memories.length === 0) return;

    const texts = memories.map((m) => m.content);
    const embeddings = await this.batchEmbed(texts);

    for (let i = 0; i < memories.length; i++) {
      try {
        await this.storeEmbedding(memories[i].id, embeddings[i]);
      } catch (error) {
        this.logger.error(
          `Failed to store embedding for memory ${memories[i].id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Batch embedded and stored ${memories.length} memories`);
  }

  /**
   * Checks whether a memory already has an embedding.
   *
   * @param memoryId - The memory UUID
   * @returns True if an embedding exists
   */
  async hasEmbedding(memoryId: string): Promise<boolean> {
    const count = await this.prisma.memoryEmbedding.count({
      where: { memoryId },
    });
    return count > 0;
  }

  /**
   * Ensures a memory has an embedding, generating one if missing.
   * This is the preferred entry point for automatic embedding after
   * a memory is created.
   *
   * @param memoryId - The memory UUID
   * @param text - The text to embed (defaults to fetching the memory)
   */
  async ensureEmbedding(memoryId: string, text?: string): Promise<void> {
    if (await this.hasEmbedding(memoryId)) {
      return;
    }

    let content = text;
    if (!content) {
      const memory = await this.prisma.memory.findUnique({
        where: { id: memoryId },
        select: { title: true, content: true, type: true },
      });
      if (!memory) {
        throw new Error(`Memory ${memoryId} not found`);
      }
      content = `${memory.title}\n${memory.content}\n类型：${memory.type}`;
    }

    // R3-BUG-029: Wrap generateEmbedding with retry and exponential backoff
    // to handle transient LLM API failures. storeEmbedding already has its own retry.
    const embedding = await retryWithBackoff(
      () => this.generateEmbedding(content),
      AI_CONFIG.MAX_RETRIES,
      AI_CONFIG.RETRY_DELAY_MS,
    );
    await this.storeEmbedding(memoryId, embedding);
  }

  /**
   * Build a dense embedding text from a memory record.
   */
  buildMemoryEmbeddingText(memory: { title: string; content: string; type: string }): string {
    return `${memory.title}\n${memory.content}\n类型：${memory.type}`;
  }
}
