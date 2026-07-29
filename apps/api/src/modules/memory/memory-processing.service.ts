import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LlmAdapterService,
  ChatMessage,
} from '../ai/services/llm-adapter.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@echolife/shared';

/**
 * Structured extraction result for a memory.
 */
interface MemoryExtraction {
  emotion?: string;
  emotionScore?: number;
  importance?: number;
  summary?: string;
  isMilestone?: boolean;
  entities?: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
  relations?: Array<{
    source: string;
    target: string;
    type: string;
  }>;
}

/**
 * Memory Processing Service
 *
 * Performs automatic post-processing on memories:
 *  - Emotion tagging and importance scoring
 *  - Entity / relation extraction for the knowledge graph
 *  - Milestone detection for growth-related memories
 *  - Low-value / stale memory archival (forgetting)
 */
@Injectable()
export class MemoryProcessingService {
  private readonly logger = new Logger(MemoryProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly knowledgeService: KnowledgeService,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * Process a single memory: extract emotion, entities, relations, detect
   * milestones, and update the memory record.
   */
  async processMemory(userId: string, memoryId: string): Promise<void> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, userId, isDeleted: false },
    });

    if (!memory) {
      this.logger.warn(`Memory ${memoryId} not found for processing`);
      return;
    }

    const extraction = await this.extractFromMemory(memory.title, memory.content);

    // Update memory with extracted emotion / importance if missing
    const updateData: Prisma.MemoryUpdateInput = {};
    if (!memory.emotion && extraction.emotion) {
      updateData.emotion = extraction.emotion;
    }
    if (memory.emotionScore == null && extraction.emotionScore != null) {
      updateData.emotionScore = extraction.emotionScore;
    }
    if (memory.importance == null && extraction.importance != null) {
      updateData.importance = extraction.importance;
    }
    if (Object.keys(updateData).length > 0) {
      await this.prisma.memory.update({
        where: { id: memoryId },
        data: updateData,
      });
    }

    // Upsert extracted entities and relations
    if (extraction.entities && extraction.entities.length > 0) {
      const entityIdMap = new Map<string, string>();
      for (const entity of extraction.entities.slice(0, 5)) {
        const id = await this.knowledgeService.upsertEntity(
          userId,
          entity.name,
          entity.type,
          entity.description,
          { sourceMemoryId: memoryId },
        );
        entityIdMap.set(`${entity.name}:${entity.type}`, id);
      }

      for (const relation of (extraction.relations ?? []).slice(0, 5)) {
        const sourceId = entityIdMap.get(`${relation.source}:*`);
        const targetId = entityIdMap.get(`${relation.target}:*`);
        if (sourceId && targetId) {
          await this.knowledgeService.upsertRelation(
            sourceId,
            targetId,
            relation.type,
            1.0,
          );
        }
      }
    }

    // Detect milestones
    if (extraction.isMilestone || this.heuristicMilestone(memory.title, memory.content)) {
      await this.ensureMilestoneMemory(userId, memoryId, memory.title, memory.content);
    }

    this.logger.log(`Processed memory ${memoryId} for user ${userId}`);
  }

  /**
   * Run nightly memory maintenance for a user:
 *  - Archive stale, low-value memories
   *  - Re-process recent unprocessed memories
   */
  async runMaintenance(userId: string): Promise<void> {
    await this.memoryService.archiveStaleMemories(userId);

    const recentMemories = await this.prisma.memory.findMany({
      where: {
        userId,
        isDeleted: false,
        isArchived: false,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
      take: 50,
    });

    for (const memory of recentMemories) {
      try {
        await this.processMemory(userId, memory.id);
      } catch (error) {
        this.logger.warn(
          `Failed to process memory ${memory.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async extractFromMemory(
    title: string,
    content: string,
  ): Promise<MemoryExtraction> {
    const prompt = `分析以下家庭记忆，只返回 JSON：
{
  "emotion": "情绪标签（如 joy/sadness/gratitude/nostalgia）",
  "emotionScore": 0.0-1.0,
  "importance": 0.0-1.0,
  "summary": "一句话摘要",
  "isMilestone": true/false,
  "entities": [
    { "name": "实体名", "type": "person/place/organization/event/concept/object", "description": "简短描述" }
  ],
  "relations": [
    { "source": "实体名", "target": "实体名", "type": "关系类型" }
  ]
}

标题：${title}
内容：${content}`;

    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: '分析这段记忆' },
        ],
        { temperature: 0.2, maxTokens: 1024 },
      );
      return this.parseJsonResponse<MemoryExtraction>(result.content) ?? {};
    } catch (error) {
      this.logger.warn(`Extraction failed: ${(error as Error).message}`);
      return {};
    }
  }

  private heuristicMilestone(title: string, content: string): boolean {
    const text = `${title} ${content}`;
    return /(会走了|会爬了|会说话|第一名|获奖|毕业|生日|周年|结婚|出生|搬家|新工作|退休)/.test(
      text,
    );
  }

  private async ensureMilestoneMemory(
    userId: string,
    sourceMemoryId: string,
    title: string,
    content: string,
  ): Promise<void> {
    const existing = await this.prisma.memory.findFirst({
      where: {
        userId,
        metadata: {
          path: ['milestoneSourceId'],
          equals: sourceMemoryId,
        },
      },
      select: { id: true },
    });

    if (existing) return;

    await this.memoryService.create(userId, {
      title: `里程碑：${title.slice(0, 80)}`,
      content,
      type: MemoryType.ACHIEVEMENT,
      emotion: 'joy',
      emotionScore: 0.8,
      importance: 0.85,
      metadata: { milestoneSourceId: sourceMemoryId, autoGenerated: true },
    });
  }

  private parseJsonResponse<T>(text: string): T | null {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}
