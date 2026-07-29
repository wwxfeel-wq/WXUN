import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmAdapterService } from './llm-adapter.service';
import {
  RetrievalConfig,
  RetrievalResult,
  MemoryWithScore,
  RAG_DEFAULTS,
  timeDecayScore,
  hybridScore,
  MemoryType,
  MemoryVisibility,
} from '@echolife/shared';
import { Prisma } from '@prisma/client';

/** Extended retrieval config with multi-source fusion flags. */
interface FusionRetrievalConfig extends RetrievalConfig {
  includeKnowledge?: boolean;
  includeLifeTree?: boolean;
  includeFamily?: boolean;
  familyMemberIds?: string[];
}

/** Extended retrieval result carrying fused sources. */
interface FusionRetrievalResult extends RetrievalResult {
  knowledgeEntities: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    score: number;
  }>;
  lifeTreeNodes: Array<{
    id: string;
    title: string;
    type: string;
    description: string | null;
    score: number;
  }>;
  familyMemories: MemoryWithScore[];
}

/** Raw row returned from the pgvector similarity search */
interface VectorSearchRow {
  id: string;
  user_id: string;
  interview_id: string | null;
  title: string;
  content: string;
  type: string;
  visibility: string;
  emotion: string | null;
  emotion_score: number | null;
  importance: number | null;
  occurred_at: Date | null;
  metadata: unknown;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  similarity: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Performs hybrid retrieval combining semantic similarity, recency, and emotion.
   *
   * Pipeline:
   * 1. Embed the query using the LLM adapter
   * 2. Run a pgvector similarity search (cosine distance) joined with the memories table
   * 3. Calculate time decay score for each result
   * 4. Calculate emotion weight from emotionScore and importance
   * 5. Combine scores with hybrid weights (semantic 0.7, recency 0.2, emotion 0.1)
   * 6. Filter by minimum similarity and return top-K
   *
   * @param query - The user's query text
   * @param config - Retrieval configuration (topK, weights, filters)
   * @returns Retrieval results with scored memories
   */
  async retrieve(query: string, config: RetrievalConfig): Promise<RetrievalResult> {
    const fusionConfig = config as FusionRetrievalConfig;
    const topK = config.topK ?? RAG_DEFAULTS.TOP_K;
    const minSimilarity = config.minSimilarity ?? RAG_DEFAULTS.MIN_SIMILARITY;
    const weights = config.weightConfig ?? {
      semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
      recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
      emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
    };

    // Step 1: Embed the query
    const queryEmbedding = await this.llmAdapter.embed(query);

    // Determine family relation context for boosting
    const familyMemberIds =
      fusionConfig.familyMemberIds ??
      (await this.findFamilyMemberUserIds(config.userId));

    // Step 2: pgvector similarity search with a join to memories
    const candidateLimit = Math.max(topK * 3, 30);
    const candidates = await this.vectorSearch(
      queryEmbedding,
      config.userId,
      candidateLimit,
      config.memoryTypes,
    );

    // Steps 3-5: Calculate hybrid scores with family relation boost
    const scoredMemories: MemoryWithScore[] = candidates
      .filter((row) => row.similarity >= minSimilarity)
      .map((row) => {
        const semanticScore = row.similarity;
        const recencyScore = timeDecayScore(row.created_at, 30);
        const emotionScore = this.calculateEmotionWeight(
          row.emotion_score,
          row.importance,
        );
        let finalScore = hybridScore(semanticScore, recencyScore, emotionScore, weights);

        // Family relation boost: memories from family members are slightly preferred
        if (familyMemberIds.includes(row.user_id)) {
          finalScore = Math.min(1, finalScore * 1.1);
        }

        return {
          id: row.id,
          userId: row.user_id,
          interviewId: row.interview_id ?? undefined,
          title: row.title,
          content: row.content,
          type: row.type as MemoryType,
          visibility: row.visibility as MemoryVisibility,
          emotion: row.emotion ?? undefined,
          importance: row.importance ?? undefined,
          occurredAt: row.occurred_at ? row.occurred_at.toISOString() : undefined,
          metadata: (row.metadata as Record<string, unknown>) ?? undefined,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
          similarityScore: semanticScore,
          recencyScore,
          emotionScore,
          finalScore,
        };
      });

    scoredMemories.sort((a, b) => b.finalScore - a.finalScore);
    const topMemories = scoredMemories.slice(0, topK);

    // Step 6: Multi-source fusion
    const result: FusionRetrievalResult = {
      memories: topMemories,
      totalFound: scoredMemories.length,
      queryEmbedding,
      knowledgeEntities: [],
      lifeTreeNodes: [],
      familyMemories: [],
    };

    if (fusionConfig.includeKnowledge) {
      result.knowledgeEntities = await this.retrieveKnowledgeEntities(
        config.userId,
        query,
      );
    }

    if (fusionConfig.includeLifeTree) {
      result.lifeTreeNodes = await this.retrieveLifeTreeNodes(
        config.userId,
        query,
      );
    }

    if (fusionConfig.includeFamily) {
      result.familyMemories = await this.retrieveFamilyMemories(
        config.userId,
        familyMemberIds,
        topK,
      );
    }

    this.logger.debug(
      `RAG retrieval: query="${query.slice(0, 50)}...", found=${candidates.length}, ` +
        `after_filter=${scoredMemories.length}, returning=${topMemories.length}`,
    );

    return result;
  }

  /**
   * Executes a pgvector similarity search with a join to the memories table.
   */
  private async vectorSearch(
    queryVector: number[],
    userId: string,
    limit: number,
    memoryTypes?: MemoryType[],
  ): Promise<VectorSearchRow[]> {
    const vectorStr = `[${queryVector.join(',')}]`;

    let typeFilter = '';
    const params: unknown[] = [vectorStr, userId, limit];

    if (memoryTypes && memoryTypes.length > 0) {
      const placeholders = memoryTypes
        .map((_, i) => `$${params.length + i + 1}`)
        .join(', ');
      typeFilter = ` AND m.type IN (${placeholders})`;
      params.push(...memoryTypes);
    }

    const sql = `
      SELECT
        m.id, m.user_id, m.interview_id, m.title, m.content, m.type,
        m.visibility, m.emotion, m.emotion_score, m.importance,
        m.occurred_at, m.metadata, m.is_deleted, m.created_at, m.updated_at,
        1 - (me.embedding <=> $1::vector) AS similarity
      FROM "memory_embeddings" me
      JOIN "memories" m ON m.id = me.memory_id
      WHERE m.user_id = $2
        AND m.is_deleted = false
        AND m.is_archived = false
        ${typeFilter}
      ORDER BY me.embedding <=> $1::vector
      LIMIT $3
    `;

    const rows = await this.prisma.$queryRawUnsafe<VectorSearchRow[]>(sql, ...params);
    return rows;
  }

  /**
   * Retrieve relevant knowledge entities by keyword search.
   */
  private async retrieveKnowledgeEntities(userId: string, query: string) {
    const terms = query
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 4);

    const where: Prisma.KnowledgeEntityWhereInput = { userId };
    if (terms.length > 0) {
      where.OR = terms.map((term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
        ],
      }));
    }

    const entities = await this.prisma.knowledgeEntity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, name: true, type: true, description: true },
    });

    return entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      score: 0.5,
    }));
  }

  /**
   * Retrieve life tree nodes that match the query keywords.
   */
  private async retrieveLifeTreeNodes(userId: string, query: string) {
    const terms = query
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 4);

    if (terms.length === 0) return [];

    const nodes = await this.prisma.lifeTreeNode.findMany({
      where: {
        userId,
        OR: terms.flatMap((term) => [
          { title: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, type: true, description: true },
    });

    return nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      description: n.description,
      score: 0.5,
    }));
  }

  /**
   * Retrieve memories shared through family groups.
   */
  private async retrieveFamilyMemories(
    userId: string,
    familyMemberIds: string[],
    limit: number,
  ): Promise<MemoryWithScore[]> {
    if (familyMemberIds.length === 0) return [];

    const familyMemories = await this.prisma.familyMemory.findMany({
      where: {
        family: {
          members: { some: { userId } },
        },
        memory: {
          isDeleted: false,
          isArchived: false,
        },
      },
      include: {
        memory: {
          select: {
            id: true,
            userId: true,
            interviewId: true,
            title: true,
            content: true,
            type: true,
            visibility: true,
            emotion: true,
            emotionScore: true,
            importance: true,
            occurredAt: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return familyMemories.map((fm) => {
      const m = fm.memory;
      const recencyScore = timeDecayScore(m.createdAt, 30);
      const emotionScore = this.calculateEmotionWeight(m.emotionScore, m.importance);
      const familyBoost = familyMemberIds.includes(m.userId) ? 1.1 : 1.0;
      const finalScore = Math.min(1, (0.5 + recencyScore * 0.2 + emotionScore * 0.1) * familyBoost);

      return {
        id: m.id,
        userId: m.userId,
        interviewId: m.interviewId ?? undefined,
        title: m.title,
        content: m.content,
        type: m.type as MemoryType,
        visibility: m.visibility as MemoryVisibility,
        emotion: m.emotion ?? undefined,
        importance: m.importance ?? undefined,
        occurredAt: m.occurredAt ? m.occurredAt.toISOString() : undefined,
        metadata: (m.metadata as Record<string, unknown>) ?? undefined,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        similarityScore: 0.5,
        recencyScore,
        emotionScore,
        finalScore,
      };
    });
  }

  /**
   * Find the user ids of all members in the same families as the given user.
   */
  private async findFamilyMemberUserIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });

    if (memberships.length === 0) return [];

    const familyIds = memberships.map((m) => m.familyId);
    const members = await this.prisma.familyMember.findMany({
      where: { familyId: { in: familyIds } },
      select: { userId: true },
      distinct: ['userId'],
    });

    return members.map((m) => m.userId);
  }

  /**
   * Calculates the emotion weight for a memory.
   */
  private calculateEmotionWeight(
    emotionScore: number | null,
    importance: number | null,
  ): number {
    const eScore = emotionScore ?? 0.5;
    const imp = importance ?? 0.5;
    return eScore * 0.6 + imp * 0.4;
  }
}
