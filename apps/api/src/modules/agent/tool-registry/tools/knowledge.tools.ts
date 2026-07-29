import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../../../knowledge/knowledge.service';
import { RagService } from '../../../ai/services/rag.service';
import {
  EntityType,
  RAG_DEFAULTS,
} from '@echolife/shared';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/**
 * Knowledge graph / knowledge-base MCP tools.
 *
 * These tools query and mutate the user's knowledge entities through the real
 * KnowledgeService and RAG pipeline.
 */
@Injectable()
export class KnowledgeTools {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly ragService: RagService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [this.searchKnowledge(), this.upsertEntity()];
  }

  private searchKnowledge(): McpToolDefinition {
    return {
      name: 'search_knowledge',
      description: '搜索知识库中的实体与相关记忆',
      parameters: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: '要搜索的关键词',
          },
          type: {
            type: 'string',
            description: '可选按实体类型过滤：person/place/organization/event/concept/object',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
        },
        required: ['term'],
      },
      handler: async (args, ctx) => this.handleSearchKnowledge(args, ctx),
    };
  }

  private async handleSearchKnowledge(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const term = String(args.term ?? '').trim();
    if (!term) {
      return {
        tool: 'search_knowledge',
        success: false,
        summary: '请提供搜索关键词',
      };
    }

    try {
      const topK = typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5;
      const type = typeof args.type === 'string' ? args.type : undefined;

      const [rag, entities] = await Promise.all([
        this.ragService.retrieve(term, {
          topK,
          userId: ctx.userId,
          weightConfig: {
            semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
            recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
            emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
          },
        }),
        term.length >= 2
          ? this.knowledgeService.searchEntities(ctx.userId, term, type)
          : Promise.resolve([]),
      ]);

      const parts: string[] = [];
      if (rag.memories.length > 0) {
        parts.push(
          `记忆片段：\n${rag.memories
            .slice(0, 3)
            .map((m) => `- ${m.title}: ${m.content.slice(0, 120)}`)
            .join('\n')}`,
        );
      }
      if (entities.length > 0) {
        parts.push(
          `知识实体：\n${entities
            .slice(0, 3)
            .map((e) => `- ${e.name}（${e.type}）${e.description ?? ''}`)
            .join('\n')}`,
        );
      }

      return {
        tool: 'search_knowledge',
        success: true,
        summary:
          parts.length > 0
            ? parts.join('\n\n')
            : '知识库中暂无匹配内容。',
        data: { memories: rag.memories, entities },
      };
    } catch (error) {
      return {
        tool: 'search_knowledge',
        success: false,
        summary: `知识检索失败：${(error as Error).message}`,
      };
    }
  }

  private upsertEntity(): McpToolDefinition {
    return {
      name: 'upsert_entity',
      description: '将关键人物、地点、事件等保存到知识图谱',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '实体名称',
          },
          type: {
            type: 'string',
            description: '实体类型：person/place/organization/event/concept/object',
            enum: Object.values(EntityType),
          },
          description: {
            type: 'string',
            description: '实体简短描述',
          },
        },
        required: ['name', 'type'],
      },
      handler: async (args, ctx) => this.handleUpsertEntity(args, ctx),
    };
  }

  private async handleUpsertEntity(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const name = String(args.name ?? '').trim();
    const type = String(args.type ?? '').trim();

    if (!name || !type) {
      return {
        tool: 'upsert_entity',
        success: false,
        summary: '请提供实体名称和类型',
      };
    }

    const validTypes = Object.values(EntityType) as string[];
    if (!validTypes.includes(type)) {
      return {
        tool: 'upsert_entity',
        success: false,
        summary: `不支持的实体类型：${type}`,
      };
    }

    try {
      const id = await this.knowledgeService.upsertEntity(
        ctx.userId,
        name,
        type,
        typeof args.description === 'string' ? args.description : undefined,
        { source: ctx.agentCode, invokedAsSkill: true },
      );

      return {
        tool: 'upsert_entity',
        success: true,
        summary: `已保存知识实体「${name}」（${type}）`,
        data: { entityId: id },
      };
    } catch (error) {
      return {
        tool: 'upsert_entity',
        success: false,
        summary: `保存知识实体失败：${(error as Error).message}`,
      };
    }
  }
}
