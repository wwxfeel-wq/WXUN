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
 * Built-in family tools for the EchoLife home dashboard.
 *
 * Covers calendar events, shopping lists, family photo search,
 * anniversary reminders, growth advice, and emotional comfort.
 * All tools store their outputs into the unified Memory model so
 * they become part of the long-term memory graph.
 */
@Injectable()
export class FamilyTools {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly ragService: RagService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      this.queryCalendar(),
      this.createCalendarEvent(),
      this.createShoppingList(),
      this.searchShoppingList(),
      this.searchFamilyPhotos(),
      this.createPhotoMemory(),
      this.queryAnniversaries(),
      this.createAnniversaryReminder(),
      this.growthAdvice(),
      this.emotionalComfort(),
    ];
  }

  // ============================================================
  // Calendar
  // ============================================================

  private queryCalendar(): McpToolDefinition {
    return {
      name: 'query_calendar',
      description: '查询用户的日程/日历事件记忆',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询关键词，如日期、事件名称',
            default: '最近安排',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleQueryCalendar(args, ctx),
    };
  }

  private async handleQueryCalendar(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '最近安排').trim();
    try {
      const result = await this.ragService.retrieve(query, {
        topK: typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
      });

      const calendarMemories = result.memories.filter(
        (m) =>
          m.metadata?.kind === 'calendar_event' ||
          m.type === MemoryType.EVENT ||
          /安排|日程|日历|聚会|会议|活动|约会/.test(m.title + m.content),
      );

      if (calendarMemories.length === 0) {
        return {
          tool: 'query_calendar',
          success: true,
          summary: '近期没有相关日历安排。',
        };
      }

      const summary = calendarMemories
        .slice(0, 3)
        .map((m) => `- ${m.occurredAt?.split('T')[0] ?? '待定'} ${m.title}: ${m.content.slice(0, 100)}`)
        .join('\n');

      return {
        tool: 'query_calendar',
        success: true,
        summary: `找到 ${calendarMemories.length} 条日程安排：\n${summary}`,
        data: calendarMemories,
      };
    } catch (error) {
      return {
        tool: 'query_calendar',
        success: false,
        summary: `查询日历失败：${(error as Error).message}`,
      };
    }
  }

  private createCalendarEvent(): McpToolDefinition {
    return {
      name: 'create_calendar_event',
      description: '创建一条日程/日历事件记忆',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '事件标题',
          },
          content: {
            type: 'string',
            description: '事件详情',
          },
          occurredAt: {
            type: 'string',
            description: '事件发生时间（ISO 8601）',
          },
        },
        required: ['title', 'content'],
      },
      handler: async (args, ctx) => this.handleCreateCalendarEvent(args, ctx),
    };
  }

  private async handleCreateCalendarEvent(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const content = String(args.content ?? '').trim();
    if (!title || !content) {
      return {
        tool: 'create_calendar_event',
        success: false,
        summary: '请提供事件标题和详情',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title,
        content,
        type: MemoryType.EVENT,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.7,
        occurredAt: typeof args.occurredAt === 'string' ? new Date(args.occurredAt) : undefined,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'calendar_event',
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'create_calendar_event',
        success: true,
        summary: `已创建日程「${memory.title}」`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_calendar_event',
        success: false,
        summary: `创建日程失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Shopping list
  // ============================================================

  private createShoppingList(): McpToolDefinition {
    return {
      name: 'create_shopping_list',
      description: '创建一条购物清单记忆',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '清单标题',
          },
          items: {
            type: 'array',
            description: '购物项列表',
            items: { type: 'string' },
          },
        },
        required: ['title', 'items'],
      },
      handler: async (args, ctx) => this.handleCreateShoppingList(args, ctx),
    };
  }

  private async handleCreateShoppingList(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const items = Array.isArray(args.items)
      ? args.items.filter((i): i is string => typeof i === 'string')
      : [];
    if (!title || items.length === 0) {
      return {
        tool: 'create_shopping_list',
        success: false,
        summary: '请提供清单标题和至少一个购物项',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title,
        content: items.map((i) => `- ${i}`).join('\n'),
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.5,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'shopping_list',
          items,
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'create_shopping_list',
        success: true,
        summary: `已保存购物清单「${memory.title}」，共 ${items.length} 项`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_shopping_list',
        success: false,
        summary: `保存购物清单失败：${(error as Error).message}`,
      };
    }
  }

  private searchShoppingList(): McpToolDefinition {
    return {
      name: 'search_shopping_list',
      description: '查找历史购物清单',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询关键词',
            default: '购物清单',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleSearchShoppingList(args, ctx),
    };
  }

  private async handleSearchShoppingList(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '购物清单').trim();
    try {
      const result = await this.ragService.retrieve(query, {
        topK: typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
      });

      const lists = result.memories.filter(
        (m) => m.metadata?.kind === 'shopping_list' || /购物|清单|囤货|买菜|超市/.test(m.title + m.content),
      );

      if (lists.length === 0) {
        return {
          tool: 'search_shopping_list',
          success: true,
          summary: '未找到相关购物清单。',
        };
      }

      const summary = lists
        .slice(0, 3)
        .map((m) => `- ${m.title}: ${m.content.slice(0, 100)}`)
        .join('\n');

      return {
        tool: 'search_shopping_list',
        success: true,
        summary: `找到 ${lists.length} 条购物清单：\n${summary}`,
        data: lists,
      };
    } catch (error) {
      return {
        tool: 'search_shopping_list',
        success: false,
        summary: `查找购物清单失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Family photos
  // ============================================================

  private searchFamilyPhotos(): McpToolDefinition {
    return {
      name: 'search_family_photos',
      description: '根据描述搜索家庭照片记忆',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '照片描述关键词',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => this.handleSearchFamilyPhotos(args, ctx),
    };
  }

  private async handleSearchFamilyPhotos(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        tool: 'search_family_photos',
        success: false,
        summary: '请提供照片描述关键词',
      };
    }

    try {
      const result = await this.ragService.retrieve(query, {
        topK: typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
      });

      const photos = result.memories.filter(
        (m) =>
          m.metadata?.kind === 'photo' ||
          /照片|图片|相册|合影|拍照/.test(m.title + m.content),
      );

      if (photos.length === 0) {
        return {
          tool: 'search_family_photos',
          success: true,
          summary: '未找到相关家庭照片。',
        };
      }

      const summary = photos
        .slice(0, 3)
        .map((m) => `- ${m.title}: ${m.content.slice(0, 120)}`)
        .join('\n');

      return {
        tool: 'search_family_photos',
        success: true,
        summary: `找到 ${photos.length} 条照片记忆：\n${summary}`,
        data: photos,
      };
    } catch (error) {
      return {
        tool: 'search_family_photos',
        success: false,
        summary: `搜索照片失败：${(error as Error).message}`,
      };
    }
  }

  private createPhotoMemory(): McpToolDefinition {
    return {
      name: 'create_photo_memory',
      description: '保存一条家庭照片记忆',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '照片标题',
          },
          description: {
            type: 'string',
            description: '照片内容描述',
          },
          url: {
            type: 'string',
            description: '照片 URL（可选）',
          },
        },
        required: ['title', 'description'],
      },
      handler: async (args, ctx) => this.handleCreatePhotoMemory(args, ctx),
    };
  }

  private async handleCreatePhotoMemory(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const description = String(args.description ?? '').trim();
    if (!title || !description) {
      return {
        tool: 'create_photo_memory',
        success: false,
        summary: '请提供照片标题和描述',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title,
        content: description,
        type: MemoryType.STORY,
        visibility: MemoryVisibility.FAMILY,
        importance: 0.7,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'photo',
          url: typeof args.url === 'string' ? args.url : undefined,
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'create_photo_memory',
        success: true,
        summary: `已保存照片记忆「${memory.title}」`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_photo_memory',
        success: false,
        summary: `保存照片记忆失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Anniversaries
  // ============================================================

  private queryAnniversaries(): McpToolDefinition {
    return {
      name: 'query_anniversaries',
      description: '查询纪念日提醒',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询关键词',
            default: '纪念日',
          },
          topK: {
            type: 'integer',
            description: '返回条数上限',
            default: 5,
          },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleQueryAnniversaries(args, ctx),
    };
  }

  private async handleQueryAnniversaries(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '纪念日').trim();
    try {
      const result = await this.ragService.retrieve(query, {
        topK: typeof args.topK === 'number' ? Math.min(args.topK, 20) : 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
      });

      const anniversaries = result.memories.filter(
        (m) =>
          m.metadata?.kind === 'anniversary' ||
          /纪念日|生日|结婚|周年|纪念/.test(m.title + m.content),
      );

      if (anniversaries.length === 0) {
        return {
          tool: 'query_anniversaries',
          success: true,
          summary: '暂未记录纪念日。',
        };
      }

      const summary = anniversaries
        .slice(0, 3)
        .map((m) => `- ${m.title}: ${m.content.slice(0, 100)}`)
        .join('\n');

      return {
        tool: 'query_anniversaries',
        success: true,
        summary: `找到 ${anniversaries.length} 条纪念日记录：\n${summary}`,
        data: anniversaries,
      };
    } catch (error) {
      return {
        tool: 'query_anniversaries',
        success: false,
        summary: `查询纪念日失败：${(error as Error).message}`,
      };
    }
  }

  private createAnniversaryReminder(): McpToolDefinition {
    return {
      name: 'create_anniversary_reminder',
      description: '创建纪念日提醒',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '纪念日标题',
          },
          date: {
            type: 'string',
            description: '纪念日期（ISO 8601）',
          },
          recurring: {
            type: 'boolean',
            description: '是否每年重复',
            default: true,
          },
        },
        required: ['title', 'date'],
      },
      handler: async (args, ctx) => this.handleCreateAnniversaryReminder(args, ctx),
    };
  }

  private async handleCreateAnniversaryReminder(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const date = String(args.date ?? '').trim();
    if (!title || !date) {
      return {
        tool: 'create_anniversary_reminder',
        success: false,
        summary: '请提供纪念日标题和日期',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `纪念日：${title}`,
        content: `${title}，日期：${date}`,
        type: MemoryType.EVENT,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.8,
        occurredAt: new Date(date),
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'anniversary',
          recurring: args.recurring !== false,
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'create_anniversary_reminder',
        success: true,
        summary: `已创建纪念日提醒「${title}」`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_anniversary_reminder',
        success: false,
        summary: `创建纪念日提醒失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Growth advice
  // ============================================================

  private growthAdvice(): McpToolDefinition {
    return {
      name: 'growth_advice',
      description: '基于成长里程碑给出成长建议',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: '成长话题，如学习、运动、社交',
            default: '成长建议',
          },
        },
        required: [],
      },
      handler: async (args, ctx) => this.handleGrowthAdvice(args, ctx),
    };
  }

  private async handleGrowthAdvice(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const topic = String(args.topic ?? '成长建议').trim();
    try {
      const result = await this.ragService.retrieve(topic, {
        topK: 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
        memoryTypes: [MemoryType.ACHIEVEMENT, MemoryType.EVENT],
      });

      const milestones = result.memories.filter(
        (m) =>
          m.metadata?.kind === 'milestone' ||
          m.type === MemoryType.ACHIEVEMENT ||
          /成长|进步|里程碑|获奖|学会/.test(m.title + m.content),
      );

      const summary =
        milestones.length > 0
          ? `已找到 ${milestones.length} 条成长记录，可结合这些记录给出建议。`
          : '暂无成长里程碑记录，建议先记录孩子的成长事件。';

      return {
        tool: 'growth_advice',
        success: true,
        summary,
        data: { milestones: milestones.slice(0, 3) },
      };
    } catch (error) {
      return {
        tool: 'growth_advice',
        success: false,
        summary: `获取成长建议失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Emotional comfort
  // ============================================================

  private emotionalComfort(): McpToolDefinition {
    return {
      name: 'emotional_comfort',
      description: '为用户或家人提供情绪安抚，并记录情绪状态',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '当前情绪或需要安抚的内容',
          },
          emotion: {
            type: 'string',
            description: '情绪标签，如 sadness/anxiety/stress',
          },
        },
        required: ['content'],
      },
      handler: async (args, ctx) => this.handleEmotionalComfort(args, ctx),
    };
  }

  private async handleEmotionalComfort(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const content = String(args.content ?? '').trim();
    if (!content) {
      return {
        tool: 'emotional_comfort',
        success: false,
        summary: '请描述当前情绪或需要安抚的内容',
      };
    }

    try {
      const emotion = typeof args.emotion === 'string' ? args.emotion : 'low';
      const memory = await this.memoryService.create(ctx.userId, {
        title: `情绪安抚：${emotion}`,
        content,
        type: MemoryType.EMOTION,
        visibility: MemoryVisibility.PRIVATE,
        emotion,
        emotionScore: 0.5,
        importance: 0.6,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'comfort',
          invokedAsSkill: true,
        },
      } as CreateMemoryDto);

      return {
        tool: 'emotional_comfort',
        success: true,
        summary: '已记录情绪状态，我会一直在这里陪你。',
        data: { memoryId: memory.id, emotion },
      };
    } catch (error) {
      return {
        tool: 'emotional_comfort',
        success: false,
        summary: `情绪安抚记录失败：${(error as Error).message}`,
      };
    }
  }
}
