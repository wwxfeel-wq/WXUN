import { Injectable, Logger } from '@nestjs/common';
import { RagService } from '../../ai/services/rag.service';
import { RedisService } from '../../../redis/redis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { RAG_DEFAULTS, MemoryWithScore, RetrievalConfig } from '@echolife/shared';
import type { FamilyContext } from '../types/agent-runtime.types';

/**
 * MemoryBridge — connects the AgentRuntime to:
 *  - long-term memory (vector RAG)
 *  - short-term working memory (Redis)
 *  - family relationships (Prisma)
 *  - knowledge graph (KnowledgeService)
 */
@Injectable()
export class MemoryBridgeService {
  private readonly logger = new Logger(MemoryBridgeService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  /**
   * Retrieve relevant long-term memories for the user's message.
   */
  async retrieveMemories(
    userId: string,
    message: string,
    overrides?: Partial<RetrievalConfig>,
  ): Promise<MemoryWithScore[]> {
    const config: RetrievalConfig = {
      topK: RAG_DEFAULTS.TOP_K,
      userId,
      weightConfig: {
        semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
        recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
        emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
      },
      minSimilarity: RAG_DEFAULTS.MIN_SIMILARITY,
      ...overrides,
    };

    try {
      const result = await this.ragService.retrieve(message, config);
      return result.memories;
    } catch (error) {
      this.logger.warn(`Memory retrieval failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Load family memberships, member profiles, and a knowledge graph summary.
   */
  async loadFamilyContext(userId: string): Promise<FamilyContext> {
    try {
      const memberships = await this.prisma.familyMember.findMany({
        where: { userId },
        include: { family: { select: { id: true, name: true } } },
      });

      const families = memberships.map((m) => ({
        id: m.familyId,
        name: m.family.name,
        role: m.role,
      }));

      const familyIds = memberships.map((m) => m.familyId);
      const members = familyIds.length
        ? await this.prisma.familyMember.findMany({
            where: { familyId: { in: familyIds } },
            include: {
              user: {
                select: {
                  id: true,
                  profile: { select: { nickname: true } },
                },
              },
            },
          })
        : [];

      const knowledgeGraphSummary = await this.buildKnowledgeGraphSummary(userId);

      return {
        families,
        members: members.map((m) => ({
          id: m.userId,
          nickname: m.user.profile?.nickname ?? null,
          familyId: m.familyId,
        })),
        knowledgeGraphSummary,
      };
    } catch (error) {
      this.logger.warn(`Family context load failed: ${(error as Error).message}`);
      return { families: [], members: [], knowledgeGraphSummary: '暂无知识图谱摘要' };
    }
  }

  /**
   * Build a compact knowledge graph summary for prompt injection.
   */
  private async buildKnowledgeGraphSummary(userId: string): Promise<string> {
    try {
      const graph = await this.knowledgeService.getKnowledgeGraph(userId, 20);
      if (graph.nodes.length === 0) {
        return '暂无知识图谱数据';
      }

      const nodeSummary = graph.nodes
        .slice(0, 8)
        .map((n) => `- ${n.name}（${n.type}）`)
        .join('\n');

      const relationSummary = graph.edges.length
        ? `\n关系片段：\n${graph.edges
            .slice(0, 5)
            .map((e) => `- ${e.source} → ${e.target}（${e.type}）`)
            .join('\n')}`
        : '';

      return `已记录 ${graph.nodes.length} 个知识实体，${graph.edges.length} 条关系。\n${nodeSummary}${relationSummary}`;
    } catch (error) {
      this.logger.warn(`Knowledge graph summary failed: ${(error as Error).message}`);
      return '暂无知识图谱数据';
    }
  }

  /**
   * Load recent messages from interview history or Redis working memory.
   */
  async loadRecentMessages(
    userId: string,
    interviewId?: string,
  ): Promise<Array<{ sender: string; content: string }>> {
    if (interviewId) {
      try {
        const messages = await this.prisma.interviewMessage.findMany({
          where: { interviewId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        return messages.reverse().map((m) => ({
          sender: m.sender,
          content: m.content,
        }));
      } catch (error) {
        this.logger.warn(`Failed to load interview messages: ${(error as Error).message}`);
      }
    }

    const workingMemory = await this.redis.getWorkingMemory<{
      messages?: Array<{ sender: string; content: string }>;
    }>(userId);
    return workingMemory?.messages?.slice(-10) ?? [];
  }

  /**
   * Update Redis working memory with the latest exchange.
   */
  async updateWorkingMemory(
    userId: string,
    userMessage: string,
    aiResponse: string,
  ): Promise<void> {
    try {
      const existing = await this.redis.getWorkingMemory<{
        messages?: Array<{ sender: string; content: string }>;
      }>(userId);
      const messages = existing?.messages ?? [];
      messages.push(
        { sender: 'user', content: userMessage },
        { sender: 'ai', content: aiResponse },
      );
      await this.redis.setWorkingMemory(userId, { messages: messages.slice(-20) });
    } catch (error) {
      this.logger.warn(`Failed to update working memory: ${(error as Error).message}`);
    }
  }

  /**
   * Format retrieved memories for prompt injection.
   */
  formatMemories(memories: MemoryWithScore[]): string {
    if (!memories || memories.length === 0) return '暂无相关记忆';
    return memories.map((m) => `- [${m.type}] ${m.title}: ${m.content}`).join('\n');
  }

  /**
   * Format recent messages for prompt injection.
   */
  formatRecentMessages(
    messages: Array<{ sender: string; content: string }>,
  ): string {
    if (messages.length === 0) return '暂无对话记录';
    return messages
      .map((m) => `${m.sender === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n');
  }
}
