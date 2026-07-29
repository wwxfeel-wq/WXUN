import { Injectable } from '@nestjs/common';
import { MemoryService } from '../../../memory/memory.service';
import { RagService } from '../../../ai/services/rag.service';
import { CreateMemoryDto } from '../../../memory/dto/create-memory.dto';
import {
  MemoryType,
  MemoryVisibility,
  RAG_DEFAULTS,
} from '@echolife/shared';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/**
 * Memory-related MCP tools.
 *
 * These tools operate on the user's long-term memory store through the real
 * MemoryService and RAG retrieval pipeline.
 */
@Injectable()
export class MemoryTools {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly ragService: RagService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      this.createMemory(),
      this.createReminder(),
      this.searchMemories(),
    ];
  }

  private createMemory(): McpToolDefinition {
    return {
      name: 'create_memory',
      description: '将一段值得保存的家庭记忆写入长期记忆库',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '记忆标题，一句话概括',
          },
          content: {
            type: 'string',
            description: '记忆正文内容',
          },
          type: {
            type: 'string',
            description: '记忆类型：story/event/emotion/achievement/daily/reflection/relationship',
            default: 'daily',
          },
          emotion: {
            type: 'string',
            description: '可选情绪标签，如 joy、gratitude、nostalgia',
          },
          importance: {
            type: 'number',
            description: '重要程度 0-1',
            default: 0.6,
          },
        },
        required: ['title', 'content'],
      },
      handler: async (args, ctx) => this.handleCreateMemory(args, ctx),
    };
  }

  private async handleCreateMemory(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const content = String(args.content ?? '').trim();

    if (!title || !content) {
      return {
        tool: 'create_memory',
        success: false,
        summary: '请提供记忆标题和正文',
      };
    }

    const type = this.normalizeMemoryType(String(args.type ?? 'daily'));

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title,
        content,
        type,
        visibility: MemoryVisibility.PRIVATE,
        emotion: typeof args.emotion === 'string' ? args.emotion : undefined,
        importance: typeof args.importance === 'number' ? args.importance : 0.6,
        metadata: { agentCode: ctx.agentCode, invokedAsSkill: true },
      } as CreateMemoryDto);

      return {
        tool: 'create_memory',
        success: true,
        summary: `已保存记忆「${memory.title}」`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_memory',
        success: false,
        summary: `保存记忆失败：${(error as Error).message}`,
      };
    }
  }

  private createReminder(): McpToolDefinition {
    return {
      name: 'create_reminder',
      description: '为家庭成员创建一条提醒通知或待办记忆',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '提醒内容，例如"周六晚上家庭聚餐"',
          },
          remindAt: {
            type: 'string',
            description: '可选的提醒时间（ISO 8601）',
          },
          importance: {
            type: 'number',
            description: '重要程度 0-1',
            default: 0.6,
          },
        },
        required: ['content'],
      },
      handler: async (args, ctx) => this.handleCreateReminder(args, ctx),
    };
  }

  private async handleCreateReminder(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const content = String(args.content ?? '').trim();
    if (!content) {
      return {
        tool: 'create_reminder',
        success: false,
        summary: '请提供提醒内容',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `提醒：${content.slice(0, 60)}`,
        content,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: typeof args.importance === 'number' ? args.importance : 0.6,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'reminder',
          remindAt: args.remindAt ?? undefined,
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'create_reminder',
        success: true,
        summary: `已记下提醒：${content}`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_reminder',
        success: false,
        summary: `创建提醒失败：${(error as Error).message}`,
      };
    }
  }

  private searchMemories(): McpToolDefinition {
    return {
      name: 'search_memories',
      description: '从用户长期记忆中检索相关内容',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或问题',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
          type: {
            type: 'string',
            description: '可选按记忆类型过滤',
          },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => this.handleSearchMemories(args, ctx),
    };
  }

  private async handleSearchMemories(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        tool: 'search_memories',
        success: false,
        summary: '请提供搜索关键词',
      };
    }

    try {
      const topK = typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5;
      const typeFilter =
        typeof args.type === 'string' && args.type
          ? this.normalizeMemoryType(args.type)
          : undefined;

      const result = await this.ragService.retrieve(query, {
        topK,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
        memoryTypes: typeFilter ? [typeFilter] : undefined,
      });

      if (result.memories.length === 0) {
        return {
          tool: 'search_memories',
          success: true,
          summary: '未找到相关记忆。',
        };
      }

      const summary = result.memories
        .slice(0, 3)
        .map((m) => `- [${m.type}] ${m.title}: ${m.content.slice(0, 120)}`)
        .join('\n');

      return {
        tool: 'search_memories',
        success: true,
        summary: `找到 ${result.memories.length} 条相关记忆：\n${summary}`,
        data: result.memories,
      };
    } catch (error) {
      return {
        tool: 'search_memories',
        success: false,
        summary: `记忆检索失败：${(error as Error).message}`,
      };
    }
  }

  private normalizeMemoryType(type: string): MemoryType {
    const valid = Object.values(MemoryType) as string[];
    return valid.includes(type) ? (type as MemoryType) : MemoryType.DAILY;
  }
}
