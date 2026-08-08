import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { LlmAdapterService, ChatMessage } from '../ai/services/llm-adapter.service';
import { PromptService } from '../ai/services/prompt.service';
import { QuotaService } from '../ai/services/quota.service';
import { NotificationService } from '../notification/notification.service';
import { GenerateSummaryDto } from './dto/generate-summary.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';
import {
  ERROR_CODES,
  AgentType,
  AI_CONFIG,
  SummaryPeriod,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** The structured summary result parsed from the AI response */
interface SummaryResult {
  title: string;
  content: string;
  highlights: string[];
  emotionTrend?: Record<string, number>;
}

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly promptService: PromptService,
    private readonly notificationService: NotificationService,
    private readonly quotaService: QuotaService,
  ) {}

  // ============================================================
  // Summary Retrieval
  // ============================================================

  /**
   * List summaries with pagination and optional period filter.
   */
  async list(userId: string, query: QuerySummaryDto): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.SummaryWhereInput = { userId };
    if (query.period) {
      where.period = query.period;
    }

    const [items, total] = await Promise.all([
      this.prisma.summary.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip,
        take,
      }),
      this.prisma.summary.count({ where }),
    ]);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single summary by ID.
   */
  async getById(userId: string, id: string) {
    const summary = await this.prisma.summary.findFirst({
      where: { id, userId },
    });

    if (!summary) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '总结不存在',
      });
    }

    return summary;
  }

  /**
   * Get the latest summary for the user, optionally filtered by period.
   */
  async getLatest(userId: string, period?: string) {
    const where: Prisma.SummaryWhereInput = { userId };
    if (period) {
      where.period = period;
    }

    const summary = await this.prisma.summary.findFirst({
      where,
      orderBy: { periodStart: 'desc' },
    });

    if (!summary) {
      return {
        userId,
        hasSummary: false,
        message: '暂无总结数据',
      };
    }

    return {
      ...summary,
      hasSummary: true,
    };
  }

  // ============================================================
  // Summary Generation
  // ============================================================

  /**
   * Generate a periodic life summary using the AI summary agent.
   * Analyzes memories within the specified date range and produces
   * a narrative summary with highlights and emotion trends.
   */
  async generate(userId: string, dto: GenerateSummaryDto) {
    // Compute the end date if not provided
    const startDate = dto.startDate;
    const endDate = dto.endDate ?? this.computeEndDate(dto.period, startDate);

    if (startDate > endDate) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '开始日期不能晚于结束日期',
      });
    }

    // Fetch memories within the date range
    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        isDeleted: false,
        occurredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        emotion: true,
        emotionScore: true,
        importance: true,
        occurredAt: true,
      },
    });

    if (memories.length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '该时间段内没有记忆数据，无法生成总结',
      });
    }

    // Build the memory text for the AI prompt
    const memoryText = memories
      .map(
        (m) =>
          `- [${m.occurredAt?.toISOString().split('T')[0] ?? '未知日期'}] ${m.title}: ${m.content}${
            m.emotion ? ` (情感: ${m.emotion})` : ''
          }`,
      )
      .join('\n');

    // Compute emotion distribution for the emotion trend
    const emotionTrend = this.computeEmotionTrend(memories);

    // Render the summary agent prompt
    const periodLabel = this.getPeriodLabel(dto.period);
    const systemPrompt = await this.promptService.render(AgentType.SUMMARY_AGENT, {
      user_nickname: '用户',
      period: `${periodLabel} (${startDate.toISOString().split('T')[0]} 至 ${endDate.toISOString().split('T')[0]})`,
      retrieved_memories: memoryText,
      user_message: '请生成生活总结',
      recent_messages: '',
    });

    const analysisPrompt = `${systemPrompt}

请基于以下用户的记忆数据，生成一份${periodLabel}生活总结。以 JSON 格式返回：
{
  "title": "总结标题（简洁有力）",
  "content": "总结正文（500-1000字，温暖鼓励的语气）",
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "emotionTrend": {
    "joy": 0.0-1.0,
    "sadness": 0.0-1.0,
    "anger": 0.0-1.0,
    "nostalgia": 0.0-1.0
  }
}

用户记忆（${memories.length}条）：
${memoryText}

只返回 JSON，不要其他内容。`;

    const messages: ChatMessage[] = [
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: `请生成${periodLabel}生活总结` },
    ];

    // R3-BUG-016: Check AI quota before LLM call, with decrement on failure
    const quotaCheck = await this.quotaService.checkAndIncrement(userId);
    if (!quotaCheck.allowed) {
      throw new BadRequestException({
        code: ERROR_CODES.QUOTA_EXCEEDED,
        message: '您的 AI 对话配额已用完，请下月重置或升级订阅计划。',
      });
    }

    let result: SummaryResult;
    try {
      const completion = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.5,
        maxTokens: AI_CONFIG.MAX_TOKENS,
      });

      result = this.parseSummaryResult(completion.content);
    } catch (error) {
      // Roll back quota increment on failure
      if (quotaCheck.quotaKey) {
        try {
          await this.quotaService.decrementUsage(quotaCheck.quotaKey);
        } catch (e) {
          this.logger.warn(`Quota rollback failed: ${(e as Error).message}`);
        }
      }
      this.logger.error(`Summary generation failed: ${(error as Error).message}`);
      // Fall back to a basic summary
      result = this.generateFallbackSummary(memories, dto.period, startDate, endDate);
    }

    // Store the summary
    const summary = await this.prisma.summary.create({
      data: {
        userId,
        period: dto.period,
        periodStart: startDate,
        periodEnd: endDate,
        title: result.title,
        content: result.content,
        highlights: result.highlights,
        emotionTrend: (result.emotionTrend ?? emotionTrend) as Prisma.InputJsonValue,
        metadata: { memoryCount: memories.length } as Prisma.InputJsonValue,
      },
    });

    // Log the AI call
    await this.logAICall(userId, AgentType.SUMMARY_AGENT);

    this.logger.log(`Summary generated for user: ${userId}, period: ${dto.period}`);

    return summary;
  }

  // ============================================================
  // Family Timeline & Story Generation
  // ============================================================

  /**
   * 生成家庭月报：汇总当月记忆、情绪趋势与重要事件，并主动推送通知。
   */
  async generateFamilyMonthlyReport(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    endDate.setMilliseconds(-1);

    const memories = await this.fetchMemoriesForRange(userId, startDate, endDate);
    if (memories.length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '该月没有记忆数据，无法生成家庭月报',
      });
    }

    const result = await this.generateNarrative(
      memories,
      `家庭月报：${year}年${month}月`,
      '请为家庭生成一份温暖的家庭月报，包含本月重要事件、情绪变化、家庭成员亮点和一张“下月可以一起做的小事”清单。',
    );

    const summary = await this.prisma.summary.create({
      data: {
        userId,
        period: 'family_monthly',
        periodStart: startDate,
        periodEnd: endDate,
        title: result.title,
        content: result.content,
        highlights: result.highlights,
        emotionTrend: (result.emotionTrend ?? this.computeEmotionTrend(memories)) as Prisma.InputJsonValue,
        metadata: { memoryCount: memories.length, kind: 'family_monthly' } as Prisma.InputJsonValue,
      },
    });

    await this.notifySummaryReady(userId, summary.id, summary.title, '家庭月报已生成，来看看这个月的回忆吧。');

    return summary;
  }

  /**
   * 生成成长故事：围绕孩子的成就、里程碑与情绪高光时刻。
   */
  async generateGrowthStory(userId: string, childName?: string) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const memories = await this.fetchMemoriesForRange(userId, startDate, endDate, [
      'achievement',
      'event',
      'emotion',
      'story',
    ]);

    if (memories.length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '没有足够的成长记忆来生成故事',
      });
    }

    const subject = childName ? `「${childName}」` : '孩子';
    const result = await this.generateNarrative(
      memories,
      `${subject}的成长故事`,
      `请以${subject}过去一年中的记忆为素材，生成一篇温暖的成长故事。突出成长里程碑、性格变化、家庭互动和让你骄傲的点滴。`,
    );

    const summary = await this.prisma.summary.create({
      data: {
        userId,
        period: 'growth_story',
        periodStart: startDate,
        periodEnd: endDate,
        title: result.title,
        content: result.content,
        highlights: result.highlights,
        emotionTrend: (result.emotionTrend ?? this.computeEmotionTrend(memories)) as Prisma.InputJsonValue,
        metadata: { memoryCount: memories.length, childName, kind: 'growth_story' } as Prisma.InputJsonValue,
      },
    });

    await this.notifySummaryReady(userId, summary.id, summary.title, '新的成长故事已生成，快去回顾这一年的变化。');

    return summary;
  }

  /**
   * 生成“这一年的我们”：以年度视角回顾全家记忆与关系变化。
   */
  async generateYearlyStory(userId: string, year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    endDate.setMilliseconds(-1);

    const memories = await this.fetchMemoriesForRange(userId, startDate, endDate);
    if (memories.length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '该年度没有记忆数据，无法生成年度回顾',
      });
    }

    const result = await this.generateNarrative(
      memories,
      `这一年的我们：${year}`,
      '请以全家的年度记忆为素材，生成一篇“这一年的我们”。回顾一起经历的重要时刻、家庭关系的变化、共同克服的困难，并对明年表达期许。',
    );

    const summary = await this.prisma.summary.create({
      data: {
        userId,
        period: 'yearly_story',
        periodStart: startDate,
        periodEnd: endDate,
        title: result.title,
        content: result.content,
        highlights: result.highlights,
        emotionTrend: (result.emotionTrend ?? this.computeEmotionTrend(memories)) as Prisma.InputJsonValue,
        metadata: { memoryCount: memories.length, kind: 'yearly_story' } as Prisma.InputJsonValue,
      },
    });

    await this.notifySummaryReady(userId, summary.id, summary.title, '年度家庭故事已生成，打开看看这一年的我们。');

    return summary;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Computes the end date for a summary period based on the start date
   * and period type.
   */
  private computeEndDate(period: string, startDate: Date): Date {
    const end = new Date(startDate);
    switch (period) {
      case SummaryPeriod.DAILY:
        end.setDate(end.getDate() + 1);
        end.setMilliseconds(-1);
        break;
      case SummaryPeriod.WEEKLY:
        end.setDate(end.getDate() + 7);
        end.setMilliseconds(-1);
        break;
      case SummaryPeriod.MONTHLY:
        end.setMonth(end.getMonth() + 1);
        end.setMilliseconds(-1);
        break;
      case SummaryPeriod.YEARLY:
        end.setFullYear(end.getFullYear() + 1);
        end.setMilliseconds(-1);
        break;
      default:
        end.setDate(end.getDate() + 7);
        end.setMilliseconds(-1);
    }
    return end;
  }

  /**
   * Computes the emotion distribution from memory data.
   */
  private computeEmotionTrend(
    memories: Array<{ emotion: string | null; emotionScore: number | null }>,
  ): Record<string, number> {
    const trend: Record<string, number> = {};
    let total = 0;

    for (const m of memories) {
      if (m.emotion) {
        const emotion = m.emotion.toLowerCase();
        trend[emotion] = (trend[emotion] ?? 0) + (m.emotionScore ?? 0.5);
        total++;
      }
    }

    // Normalize to 0-1 range
    if (total > 0) {
      for (const key of Object.keys(trend)) {
        trend[key] = trend[key] / total;
      }
    }

    return trend;
  }

  /**
   * Fetch memories within a date range, optionally filtered by type.
   */
  private async fetchMemoriesForRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    types?: string[],
  ) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        isDeleted: false,
        isArchived: false,
        occurredAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(types && types.length > 0 ? { type: { in: types } } : {}),
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        emotion: true,
        emotionScore: true,
        importance: true,
        occurredAt: true,
      },
    });
  }

  /**
   * Generate a narrative summary (title, content, highlights, emotionTrend)
   * from a list of memories using the AI model.
   */
  private async generateNarrative(
    memories: Array<{
      title: string;
      content: string;
      type: string;
      emotion: string | null;
      occurredAt: Date | null;
    }>,
    defaultTitle: string,
    instruction: string,
  ): Promise<SummaryResult> {
    const memoryText = memories
      .map(
        (m) =>
          `- [${m.occurredAt?.toISOString().split('T')[0] ?? '未知日期'}] ${m.title}: ${m.content}${
            m.emotion ? ` (情感: ${m.emotion})` : ''
          }`,
      )
      .join('\n');

    const prompt = `${instruction}

请基于以下记忆，生成一个 JSON 对象，不要返回其他内容：
{
  "title": "标题",
  "content": "正文（温暖、有故事感，500-1000字）",
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "emotionTrend": { "joy": 0.0, "nostalgia": 0.0, "gratitude": 0.0, "calm": 0.0 }
}

记忆（${memories.length}条）：
${memoryText}`;

    try {
      const completion = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: '请生成总结' },
        ],
        { temperature: 0.6, maxTokens: AI_CONFIG.MAX_TOKENS },
      );
      return this.parseSummaryResult(completion.content);
    } catch (error) {
      this.logger.error(`Narrative generation failed: ${(error as Error).message}`);
      return {
        title: defaultTitle,
        content: `共记录了 ${memories.length} 条记忆。AI 服务暂时不可用，已为您归档这段时间的回忆。`,
        highlights: memories.slice(0, 3).map((m) => m.title),
      };
    }
  }

  /**
   * Notify the user that a new family summary/story is ready.
   */
  private async notifySummaryReady(
    userId: string,
    summaryId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notificationService.create({
        userId,
        type: 'family_summary_ready',
        title,
        body,
        data: { summaryId, kind: 'family_summary' },
      });
    } catch (error) {
      this.logger.warn(`Failed to send summary notification: ${(error as Error).message}`);
    }
  }

  /**
   * Returns a human-readable label for the period type.
   */
  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      [SummaryPeriod.DAILY]: '每日',
      [SummaryPeriod.WEEKLY]: '每周',
      [SummaryPeriod.MONTHLY]: '每月',
      [SummaryPeriod.YEARLY]: '每年',
    };
    return labels[period] ?? period;
  }

  /**
   * Parses the JSON response from the LLM into a summary result.
   */
  private parseSummaryResult(text: string): SummaryResult {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned) as SummaryResult;

      return {
        title: parsed.title ?? '生活总结',
        content: parsed.content ?? '',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        emotionTrend: parsed.emotionTrend,
      };
    } catch {
      this.logger.warn(`Failed to parse summary JSON: ${text.slice(0, 200)}`);
      return {
        title: '生活总结',
        content: text,
        highlights: [],
      };
    }
  }

  /**
   * Generates a basic fallback summary when the AI service is unavailable.
   */
  private generateFallbackSummary(
    memories: Array<{ title: string; content: string; emotion: string | null; occurredAt: Date | null }>,
    period: string,
    startDate: Date,
    endDate: Date,
  ): SummaryResult {
    const titles = memories.map((m) => m.title).slice(0, 5);

    return {
      title: `${this.getPeriodLabel(period)}生活总结`,
      content: `在 ${startDate.toISOString().split('T')[0]} 至 ${endDate.toISOString().split('T')[0]} 期间，您共记录了 ${memories.length} 条记忆。这些记忆记录了您这段时间的生活点滴。（AI服务暂不可用，此为基本总结）`,
      highlights: titles,
      emotionTrend: {},
    };
  }

  /**
   * Logs an AI call to the database.
   */
  private async logAICall(userId: string, agentType: string): Promise<void> {
    try {
      await this.prisma.aICallLog.create({
        data: {
          userId,
          agentType,
          model: AI_CONFIG.MODEL,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: 0,
          status: 'success',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log AI call: ${(error as Error).message}`);
    }
  }
}
