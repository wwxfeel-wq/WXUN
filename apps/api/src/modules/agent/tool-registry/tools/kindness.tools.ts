import { Injectable } from '@nestjs/common';
import { KindnessService } from '../../../kindness/kindness.service';
import { CreateKindnessDto } from '../../../kindness/dto/create-kindness.dto';
import {
  KindnessType,
  KindnessLevel,
} from '@echolife/shared';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/**
 * Kindness Tools — 童忆引擎 Agent 工具集
 *
 * 三个 Agent 的工具映射：
 * - Memory Story Agent: reconstruct_kindness_story, generate_family_story
 * - Kindness Agent: detect_kindness, create_kindness_memory, query_kindness
 * - Companion Agent: generate_warm_reminder, get_kindness_stats
 *
 * 所有工具通过 KindnessService 操作数据，
 * 所有数据自动进入 Family Memory Graph。
 */
@Injectable()
export class KindnessTools {
  constructor(
    private readonly kindnessService: KindnessService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      // ── Memory Story Agent 工具 ──
      this.reconstructKindnessStory(),
      this.generateFamilyStory(),

      // ── Kindness Agent 工具 ──
      this.detectKindness(),
      this.createKindnessMemory(),
      this.queryKindnessMemories(),

      // ── Companion Agent 工具 ──
      this.generateWarmReminder(),
      this.getKindnessStats(),
    ];
  }

  // ============================================================
  // Memory Story Agent — 整理家庭故事
  // ============================================================

  private reconstructKindnessStory(): McpToolDefinition {
    return {
      name: 'reconstruct_kindness_story',
      description: '将一条温暖瞬间重新讲述成一段短故事，像小时候公益广告的风格',
      parameters: {
        type: 'object',
        properties: {
          kindnessId: {
            type: 'string',
            description: '温暖瞬间 ID',
          },
        },
        required: ['kindnessId'],
      },
      handler: async (args, ctx) => this.handleReconstructStory(args, ctx),
    };
  }

  private async handleReconstructStory(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const kindnessId = String(args.kindnessId ?? '').trim();
    if (!kindnessId) {
      return {
        tool: 'reconstruct_kindness_story',
        success: false,
        summary: '请提供温暖瞬间 ID',
      };
    }

    try {
      const story = await this.kindnessService.reconstructStory(ctx.userId, kindnessId);
      return {
        tool: 'reconstruct_kindness_story',
        success: true,
        summary: '已生成温暖故事',
        data: { story },
      };
    } catch (error) {
      return {
        tool: 'reconstruct_kindness_story',
        success: false,
        summary: `故事生成失败：${(error as Error).message}`,
      };
    }
  }

  private generateFamilyStory(): McpToolDefinition {
    return {
      name: 'generate_family_story',
      description: '生成每天或每周的家庭短故事，串联近期的温暖瞬间',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: '故事周期：daily 或 weekly',
            enum: ['daily', 'weekly'],
            default: 'daily',
          },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleGenerateFamilyStory(args, ctx),
    };
  }

  private async handleGenerateFamilyStory(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const period = (args.period === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly';
    try {
      const story = await this.kindnessService.generateShortStory(ctx.userId, period);
      return {
        tool: 'generate_family_story',
        success: true,
        summary: `已生成${period === 'daily' ? '今日' : '本周'}家庭故事`,
        data: story,
      };
    } catch (error) {
      return {
        tool: 'generate_family_story',
        success: false,
        summary: `家庭故事生成失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Kindness Agent — 发现家庭温暖行为
  // ============================================================

  private detectKindness(): McpToolDefinition {
    return {
      name: 'detect_kindness',
      description: '从用户输入文本中自动识别家庭温暖行为（陪伴、关心、庆祝、成长、支持）',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '需要分析的文本内容',
          },
        },
        required: ['text'],
      },
      handler: async (args, ctx) => this.handleDetectKindness(args, ctx),
    };
  }

  private async handleDetectKindness(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const text = String(args.text ?? '').trim();
    if (!text) {
      return {
        tool: 'detect_kindness',
        success: false,
        summary: '请提供需要分析的文本',
      };
    }

    try {
      const result = await this.kindnessService.detectKindness(ctx.userId, text);
      if (!result.detected) {
        return {
          tool: 'detect_kindness',
          success: true,
          summary: '未检测到家庭温暖行为',
          data: { detected: false },
        };
      }
      return {
        tool: 'detect_kindness',
        success: true,
        summary: `检测到温暖行为：${result.summary ?? result.event}`,
        data: result,
      };
    } catch (error) {
      return {
        tool: 'detect_kindness',
        success: false,
        summary: `温暖识别失败：${(error as Error).message}`,
      };
    }
  }

  private createKindnessMemory(): McpToolDefinition {
    return {
      name: 'create_kindness_memory',
      description: '记录一条家庭温暖瞬间，自动进入 Family Memory Graph 并生成 AI 故事',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '温暖瞬间标题' },
          content: { type: 'string', description: '温暖瞬间内容' },
          event: { type: 'string', description: '事件简述' },
          people: {
            type: 'array',
            description: '相关人员',
            items: { type: 'string' },
          },
          type: {
            type: 'string',
            description: '温暖类型',
            enum: Object.values(KindnessType),
            default: KindnessType.COMPANIONSHIP,
          },
          importance: {
            type: 'string',
            description: '重要度等级（影响粒子颜色）',
            enum: Object.values(KindnessLevel),
            default: KindnessLevel.WARM,
          },
          emotion: { type: 'string', description: '情绪标签', default: 'love' },
          location: { type: 'string', description: '地点（可选）' },
          occurredAt: { type: 'string', description: '发生时间 ISO 8601（可选）' },
          familyId: { type: 'string', description: '家庭 ID（可选）' },
        },
        required: ['title', 'content', 'event'],
      },
      handler: async (args, ctx) => this.handleCreateKindnessMemory(args, ctx),
    };
  }

  private async handleCreateKindnessMemory(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const content = String(args.content ?? '').trim();
    const event = String(args.event ?? '').trim();

    if (!title || !content || !event) {
      return {
        tool: 'create_kindness_memory',
        success: false,
        summary: '请提供标题、内容和事件简述',
      };
    }

    try {
      const dto: CreateKindnessDto = {
        title,
        content,
        event,
        type: (args.type as KindnessType) ?? KindnessType.COMPANIONSHIP,
        importance: (args.importance as KindnessLevel) ?? KindnessLevel.WARM,
        people: Array.isArray(args.people) ? args.people.filter((p): p is string => typeof p === 'string') : [],
        emotion: typeof args.emotion === 'string' ? args.emotion : 'love',
        location: typeof args.location === 'string' ? args.location : undefined,
        occurredAt: typeof args.occurredAt === 'string' ? args.occurredAt : undefined,
        familyId: typeof args.familyId === 'string' ? args.familyId : undefined,
      };

      const kindness = await this.kindnessService.create(ctx.userId, dto);

      return {
        tool: 'create_kindness_memory',
        success: true,
        summary: `已记录温暖瞬间「${title}」，AI 正在后台生成故事`,
        data: { kindnessId: kindness.id, memoryId: kindness.memoryId },
      };
    } catch (error) {
      return {
        tool: 'create_kindness_memory',
        success: false,
        summary: `记录温暖瞬间失败：${(error as Error).message}`,
      };
    }
  }

  private queryKindnessMemories(): McpToolDefinition {
    return {
      name: 'query_kindness_memories',
      description: '查询用户的温暖瞬间列表',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '温暖类型筛选',
            enum: Object.values(KindnessType),
          },
          importance: {
            type: 'string',
            description: '重要度筛选',
            enum: Object.values(KindnessLevel),
          },
          search: { type: 'string', description: '搜索关键词' },
          topK: { type: 'integer', description: '返回条数', default: 5 },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleQueryKindness(args, ctx),
    };
  }

  private async handleQueryKindness(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    try {
      const result = await this.kindnessService.list(ctx.userId, {
        type: args.type as KindnessType | undefined,
        importance: args.importance as KindnessLevel | undefined,
        search: typeof args.search === 'string' ? args.search : undefined,
        page: 1,
        pageSize: typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5,
      });

      if (result.items.length === 0) {
        return {
          tool: 'query_kindness_memories',
          success: true,
          summary: '暂无温暖瞬间记录',
        };
      }

      const summary = result.items
        .slice(0, 3)
        .map((k: { title: string; event: string; occurredAt: Date | null }) =>
          `- ${k.title}：${k.event}（${k.occurredAt ? new Date(k.occurredAt).toISOString().split('T')[0] : '最近'}）`)
        .join('\n');

      return {
        tool: 'query_kindness_memories',
        success: true,
        summary: `找到 ${result.total} 条温暖瞬间：\n${summary}`,
        data: result.items,
      };
    } catch (error) {
      return {
        tool: 'query_kindness_memories',
        success: false,
        summary: `查询失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Companion Agent — 主动陪伴提醒
  // ============================================================

  private generateWarmReminder(): McpToolDefinition {
    return {
      name: 'generate_warm_reminder',
      description: '生成一条每日温暖提醒，像童年公益广告一样的短暂陪伴',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (_args, ctx) => this.handleGenerateWarmReminder(ctx),
    };
  }

  private async handleGenerateWarmReminder(ctx: McpToolContext): Promise<McpToolResult> {
    try {
      const reminder = await this.kindnessService.generateDailyReminder(ctx.userId);
      return {
        tool: 'generate_warm_reminder',
        success: true,
        summary: reminder.message,
        data: reminder,
      };
    } catch (error) {
      return {
        tool: 'generate_warm_reminder',
        success: false,
        summary: `温暖提醒生成失败：${(error as Error).message}`,
      };
    }
  }

  private getKindnessStats(): McpToolDefinition {
    return {
      name: 'get_kindness_stats',
      description: '获取用户的温暖瞬间统计（总数、连续天数、类型分布等）',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (_args, ctx) => this.handleGetKindnessStats(ctx),
    };
  }

  private async handleGetKindnessStats(ctx: McpToolContext): Promise<McpToolResult> {
    try {
      const stats = await this.kindnessService.getStats(ctx.userId);
      return {
        tool: 'get_kindness_stats',
        success: true,
        summary: `共 ${stats.total} 条温暖瞬间，连续 ${stats.streakDays} 天，最近7天新增 ${stats.recentCount} 条`,
        data: stats,
      };
    } catch (error) {
      return {
        tool: 'get_kindness_stats',
        success: false,
        summary: `统计获取失败：${(error as Error).message}`,
      };
    }
  }
}
