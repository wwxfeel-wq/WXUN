import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MemoryService } from '../memory/memory.service';
import { LlmAdapterService, ChatMessage } from '../ai/services/llm-adapter.service';
import {
  KindnessType,
  KindnessLevel,
  MemoryType,
  MemoryVisibility,
  SHIMO_PERSONA,
  REDIS_KEYS,
  REDIS_TTL,
} from '@echolife/shared';
import type { KindnessStats } from '@echolife/shared';
import { CreateKindnessDto } from './dto/create-kindness.dto';
import { QueryKindnessDto } from './dto/query-kindness.dto';

/**
 * KindnessService — 童忆引擎核心服务
 *
 * 五大核心能力：
 * 1. Memory Story Reconstruction — 基于家庭数据生成温暖故事
 * 2. Family Kindness Moments — 自动识别家庭温暖行为
 * 3. Daily Warm Reminder — 像童年公益广告一样的陪伴提醒
 * 4. Memory Capsule — 升级版时间胶囊（媒体 + AI 重述）
 * 5. SuiYan Emotional Narrative — 时墨温暖叙事
 *
 * 所有数据通过 MemoryService 进入 Family Memory Graph。
 */
@Injectable()
export class KindnessService {
  private readonly logger = new Logger(KindnessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly memoryService: MemoryService,
    private readonly llmAdapter: LlmAdapterService,
  ) {}

  // ============================================================
  // CRUD — 温暖瞬间管理
  // ============================================================

  /**
   * 创建温暖瞬间 — 同时创建关联 Memory 记录，进入 Family Memory Graph
   */
  async create(userId: string, dto: CreateKindnessDto) {
    // 1. 先创建 Memory 记录（进入 Family Memory Graph）
    const memory = await this.memoryService.create(userId, {
      title: dto.title,
      content: dto.content,
      type: MemoryType.EVENT,
      visibility: dto.familyId ? MemoryVisibility.FAMILY : MemoryVisibility.PRIVATE,
      emotion: dto.emotion ?? 'love',
      emotionScore: dto.emotionScore ?? 0.8,
      importance: this.levelToScore(dto.importance ?? KindnessLevel.WARM),
      occurredAt: dto.occurredAt,
      metadata: {
        kind: 'kindness',
        kindnessType: dto.type ?? KindnessType.COMPANIONSHIP,
        kindnessLevel: dto.importance ?? KindnessLevel.WARM,
        people: dto.people ?? [],
        event: dto.event,
        location: dto.location,
        source: 'childhood_memory_engine',
      },
    });

    // 2. 创建 KindnessMemory 记录
    const kindness = await this.prisma.kindnessMemory.create({
      data: {
        userId,
        familyId: dto.familyId ?? null,
        memoryId: memory.id,
        title: dto.title,
        content: dto.content,
        type: (dto.type ?? KindnessType.COMPANIONSHIP) as string,
        importance: (dto.importance ?? KindnessLevel.WARM) as string,
        people: dto.people ?? [],
        event: dto.event,
        emotion: dto.emotion ?? 'love',
        emotionScore: dto.emotionScore ?? null,
        location: dto.location ?? null,
        media: (dto.media ?? null) as Prisma.InputJsonValue,
        visibility: dto.familyId ? 'family' : 'private',
        occurredAt: dto.occurredAt ?? null,
      },
    });

    this.logger.log(`KindnessMemory created: ${kindness.id} [${dto.type}/${dto.importance}]`);

    // 3. 异步生成 AI 温暖故事
    this.generateStoryInBackground(userId, kindness.id).catch((err) => {
      this.logger.warn(`Background story generation failed for ${kindness.id}: ${(err as Error).message}`);
    });

    await this.invalidateCache(userId);

    return { ...kindness, memory };
  }

  /**
   * 查找单个温暖瞬间
   */
  async findById(userId: string, id: string) {
    const kindness = await this.prisma.kindnessMemory.findFirst({
      where: { id, userId, isDeleted: false },
      include: { memory: true, family: true },
    });

    if (!kindness) {
      throw new NotFoundException({
        code: 'KINDNESS_NOT_FOUND',
        message: '温暖瞬间不存在或已被删除',
      });
    }

    return kindness;
  }

  /**
   * 分页查询温暖瞬间
   */
  async list(userId: string, query: QueryKindnessDto) {
    const { page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where = this.buildWhereClause(userId, query);
    const orderBy = { [query.sortBy ?? 'occurredAt']: query.sortOrder ?? 'desc' } as Prisma.KindnessMemoryOrderByWithRelationInput;

    const [items, total] = await Promise.all([
      this.prisma.kindnessMemory.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          memory: { select: { id: true, title: true, embedding: true } },
        },
      }),
      this.prisma.kindnessMemory.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 软删除温暖瞬间
   */
  async softDelete(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.kindnessMemory.findFirst({
      where: { id, userId, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'KINDNESS_NOT_FOUND',
        message: '温暖瞬间不存在或已被删除',
      });
    }

    await this.prisma.kindnessMemory.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await this.invalidateCache(userId);
  }

  // ============================================================
  // 核心能力 1：Memory Story Reconstruction
  // ============================================================

  /**
   * 基于家庭照片、聊天记录、事件、时间线，AI 生成温暖家庭故事
   */
  async reconstructStory(userId: string, kindnessId: string): Promise<string> {
    const kindness = await this.findById(userId, kindnessId);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR}，${SHIMO_PERSONA.ROLE}。
你现在正在帮用户把一段家庭温暖瞬间重新讲述成一个短故事。

风格要求：
- 像小时候少儿频道公益广告一样：短、温暖、有画面感
- 不要长篇大论，3-5 句话
- 保留细节，渲染情感
- 最后一句点题，但不刻意升华
- 用中文，像在对家人说话`,
      },
      {
        role: 'user',
        content: `请帮我把这个瞬间重新讲述：

标题：${kindness.title}
事件：${kindness.event}
时间：${kindness.occurredAt?.toLocaleDateString('zh-CN') ?? '最近'}
人物：${kindness.people.join('、')}
地点：${kindness.location ?? '未记录'}
情绪：${kindness.emotion}

原始记录：
${kindness.content}

请生成一段温暖的家庭故事。`,
      },
    ];

    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.8,
        maxTokens: 500,
      });

      // 保存 AI 生成的故事
      await this.prisma.kindnessMemory.update({
        where: { id: kindnessId },
        data: { story: result.content },
      });

      this.logger.log(`Story reconstructed for kindness ${kindnessId}`);
      return result.content;
    } catch (error) {
      this.logger.error(`Story reconstruction failed: ${(error as Error).message}`);
      throw new BadRequestException({
        code: 'STORY_GENERATION_FAILED',
        message: `故事生成失败：${(error as Error).message}`,
      });
    }
  }

  // ============================================================
  // 核心能力 2：Family Kindness Moments — 自动识别
  // ============================================================

  /**
   * 从用户输入文本中自动识别家庭温暖行为，生成 KindnessMemory
   */
  async detectKindness(userId: string, text: string): Promise<{
    detected: boolean;
    type?: KindnessType;
    importance?: KindnessLevel;
    people?: string[];
    event?: string;
    emotion?: string;
    summary?: string;
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是「${SHIMO_PERSONA.NAME}」的温暖识别模块。
分析用户输入，判断是否包含家庭温暖行为。

识别维度：
- 陪伴行为 (companionship): 一起吃饭、旅行、散步
- 关心行为 (care): 准备早餐、叮嘱添衣、照顾生病
- 庆祝时刻 (celebration): 生日、节日、纪念日
- 成长记录 (growth): 第一次走路、获奖、毕业
- 情感支持 (support): 安慰、鼓励、倾听

重要度判断：
- warm: 普通温暖瞬间
- family: 家庭事件
- childhood: 童年温暖回忆
- golden: 重要家庭瞬间

返回 JSON 格式：
{"detected": true/false, "type": "...", "importance": "...", "people": [...], "event": "...", "emotion": "...", "summary": "一句话概括"}`,
      },
      {
        role: 'user',
        content: text,
      },
    ];

    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.3,
        maxTokens: 300,
      });

      const parsed = this.safeParseJson(result.content);
      if (!parsed || !parsed.detected) {
        return { detected: false };
      }

      return {
        detected: true,
        type: parsed.type as KindnessType,
        importance: parsed.importance as KindnessLevel,
        people: Array.isArray(parsed.people) ? parsed.people : [],
        event: parsed.event ?? text.slice(0, 100),
        emotion: parsed.emotion ?? 'love',
        summary: parsed.summary,
      };
    } catch (error) {
      this.logger.warn(`Kindness detection failed: ${(error as Error).message}`);
      return { detected: false };
    }
  }

  // ============================================================
  // 核心能力 3：Daily Warm Reminder
  // ============================================================

  /**
   * 生成每日温暖提醒 — 像童年公益广告一样的短暂陪伴
   */
  async generateDailyReminder(userId: string): Promise<{
    message: string;
    context: string;
  }> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=周日
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 查询用户最近的温暖瞬间作为上下文
    const recentKindness = await this.prisma.kindnessMemory.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { occurredAt: 'desc' },
      select: { title: true, event: true, people: true, occurredAt: true },
    });

    const contextParts: string[] = [];
    if (hour >= 20) contextParts.push('现在是晚上');
    else if (hour >= 17) contextParts.push('现在是傍晚');
    else if (hour >= 12) contextParts.push('现在是下午');
    else contextParts.push('现在是上午');

    if (isWeekend) contextParts.push('周末');
    if (recentKindness) {
      contextParts.push(`最近记录的温暖瞬间：${recentKindness.event}`);
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR}。
请生成一条简短的温暖提醒，像小时候少儿频道公益广告一样的陪伴感。

要求：
- 1-2 句话，不超过 50 字
- 温暖但不鸡汤，像一个关心你的朋友随口说的
- 可以提醒陪家人、记录温暖瞬间、或单纯的一句问候
- 不要用感叹号，不要说教
- 用中文`,
      },
      {
        role: 'user',
        content: `当前时间上下文：${contextParts.join('，')}
${recentKindness ? `用户家庭中最近发生的事：${recentKindness.event}（${recentKindness.people.join('、')}）` : '暂无最近的温暖记录'}

请生成今天的温暖提醒。`,
      },
    ];

    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.9,
        maxTokens: 100,
      });

      const message = result.content.trim();

      // 持久化提醒记录
      await this.prisma.warmReminder.create({
        data: {
          userId,
          message,
          context: contextParts.join('，'),
          scheduledFor: now,
          deliveredAt: now,
          status: 'delivered',
        },
      });

      return { message, context: contextParts.join('，') };
    } catch (error) {
      this.logger.warn(`Daily reminder generation failed: ${(error as Error).message}`);
      // 返回默认提醒
      const fallback = isWeekend
        ? '今天周末，记得陪爸爸喝一次茶。'
        : '今天有没有和家人聊聊最近发生的小事？';
      return { message: fallback, context: contextParts.join('，') };
    }
  }

  /**
   * 获取待发送的温暖提醒
   */
  async getPendingReminders(userId: string) {
    return this.prisma.warmReminder.findMany({
      where: {
        userId,
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 5,
    });
  }

  // ============================================================
  // 核心能力 4：Family Short Story Generator
  // ============================================================

  /**
   * 生成每天/每周家庭短故事 — 类似公益广告的精神
   */
  async generateShortStory(
    userId: string,
    period: 'daily' | 'weekly' = 'daily',
  ): Promise<{
    id: string;
    title: string;
    content: string;
  }> {
    const now = new Date();
    const periodStart = new Date(now);
    if (period === 'daily') {
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart.setDate(periodStart.getDate() - 7);
    }

    // 查询时间段内的温暖瞬间
    const kindnessMemories = await this.prisma.kindnessMemory.findMany({
      where: {
        userId,
        isDeleted: false,
        occurredAt: { gte: periodStart, lte: now },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        title: true,
        content: true,
        event: true,
        people: true,
        emotion: true,
        occurredAt: true,
        location: true,
      },
    });

    if (kindnessMemories.length === 0) {
      return {
        id: '',
        title: period === 'daily' ? '今天的故事' : '这周的故事',
        content: '今天还没有新的家庭温暖瞬间。每一个和家人在一起的时刻，都值得被记录。',
      };
    }

    // 构建 AI 输入
    const memorySummaries = kindnessMemories
      .map((k, i) => `${i + 1}. ${k.title}（${k.occurredAt?.toLocaleDateString('zh-CN') ?? '最近'}）
   事件：${k.event}
   人物：${k.people.join('、')}
   情绪：${k.emotion}`)
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR}，正在帮用户把${period === 'daily' ? '今天' : '这周'}的家庭温暖瞬间编织成一个短故事。

风格：
- 像小时候电视里的家庭公益广告：短、温暖、有画面
- ${period === 'daily' ? '100-200 字' : '200-400 字'}
- 串联多个瞬间，但不要流水账
- 结尾轻轻点题，像公益广告最后的旁白
- 用中文`,
      },
      {
        role: 'user',
        content: `以下是${period === 'daily' ? '今天' : '这周'}记录的家庭温暖瞬间：

${memorySummaries}

请把这些瞬间编织成一段温暖的家庭故事。`,
      },
    ];

    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.85,
        maxTokens: period === 'daily' ? 400 : 800,
      });

      const title = period === 'daily'
        ? `${now.getMonth() + 1}月${now.getDate()}日的家庭故事`
        : `${now.getMonth() + 1}月第${Math.ceil(now.getDate() / 7)}周家庭故事`;

      // 持久化
      const story = await this.prisma.familyShortStory.create({
        data: {
          userId,
          title,
          content: result.content,
          period,
          periodStart,
          periodEnd: now,
          kindnessMemoryIds: kindnessMemories.map((k) => k.id),
          emotion: kindnessMemories[0]?.emotion ?? 'love',
        },
      });

      this.logger.log(`Short story generated: ${story.id} [${period}]`);

      return {
        id: story.id,
        title,
        content: result.content,
      };
    } catch (error) {
      this.logger.error(`Short story generation failed: ${(error as Error).message}`);
      throw new BadRequestException({
        code: 'STORY_GENERATION_FAILED',
        message: `家庭故事生成失败：${(error as Error).message}`,
      });
    }
  }

  /**
   * 获取历史家庭短故事
   */
  async getShortStories(userId: string, page = 1, pageSize = 10) {
    const [items, total] = await Promise.all([
      this.prisma.familyShortStory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.familyShortStory.count({ where: { userId } }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ============================================================
  // 核心能力 5：Kindness Network — Life Core 可视化数据
  // ============================================================

  /**
   * 获取 Kindness Network 节点 — 供前端 Life Core 粒子云渲染
   */
  async getKindnessNodes(userId: string, limit = 50) {
    const memories = await this.prisma.kindnessMemory.findMany({
      where: { userId, isDeleted: false },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        importance: true,
        event: true,
        people: true,
        emotion: true,
        occurredAt: true,
      },
    });

    return memories.map((m) => ({
      id: m.id,
      kind: m.importance,
      type: m.type,
      label: m.event,
      timestamp: m.occurredAt?.toISOString() ?? new Date().toISOString(),
      people: m.people,
      emotion: m.emotion,
    }));
  }

  // ============================================================
  // 统计
  // ============================================================

  async getStats(userId: string): Promise<KindnessStats> {
    const cacheKey = `${REDIS_KEYS.AGENT_CACHE}kindness_stats:${userId}`;
    const cached = await this.redis.getJSON<KindnessStats>(cacheKey);
    if (cached) return cached;

    const where = { userId, isDeleted: false };

    const [total, typeGroups, levelGroups, emotionGroups, recentCount, dateRange, topPeople] =
      await Promise.all([
        this.prisma.kindnessMemory.count({ where }),
        this.prisma.kindnessMemory.groupBy({ by: ['type'], where, _count: { type: true } }),
        this.prisma.kindnessMemory.groupBy({ by: ['importance'], where, _count: { importance: true } }),
        this.prisma.kindnessMemory.groupBy({ by: ['emotion'], where, _count: { emotion: true } }),
        this.prisma.kindnessMemory.count({
          where: { ...where, occurredAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        }),
        this.prisma.kindnessMemory.aggregate({
          where,
          _min: { occurredAt: true },
          _max: { occurredAt: true },
        }),
        this.prisma.kindnessMemory.findMany({
          where,
          select: { people: true },
        }),
      ]);

    // 统计出现最多的人
    const peopleCount: Record<string, number> = {};
    for (const m of topPeople) {
      for (const p of m.people) {
        peopleCount[p] = (peopleCount[p] ?? 0) + 1;
      }
    }
    const topPeopleList = Object.entries(peopleCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 计算连续天数
    const streakDays = await this.calculateStreak(userId);

    const stats: KindnessStats = {
      total,
      byType: Object.fromEntries(typeGroups.map((g) => [g.type, g._count.type])),
      byLevel: Object.fromEntries(levelGroups.map((g) => [g.importance, g._count.importance])),
      byEmotion: Object.fromEntries(emotionGroups.filter((g) => g.emotion).map((g) => [g.emotion!, g._count.emotion])),
      recentCount,
      streakDays,
      topPeople: topPeopleList,
      dateRange: {
        earliest: dateRange._min.occurredAt?.toISOString() ?? null,
        latest: dateRange._max.occurredAt?.toISOString() ?? null,
      },
    };

    await this.redis.setJSON(cacheKey, stats, REDIS_TTL.SHORT_CACHE);
    return stats;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private buildWhereClause(userId: string, query: QueryKindnessDto): Prisma.KindnessMemoryWhereInput {
    const where: Prisma.KindnessMemoryWhereInput = {
      userId,
      isDeleted: false,
    };

    if (query.type) where.type = query.type;
    if (query.importance) where.importance = query.importance;
    if (query.emotion) where.emotion = query.emotion;
    if (query.familyId) where.familyId = query.familyId;

    if (query.startDate || query.endDate) {
      where.occurredAt = {};
      if (query.startDate) where.occurredAt.gte = new Date(query.startDate);
      if (query.endDate) where.occurredAt.lte = new Date(query.endDate);
    }

    if (query.search) {
      const trimmed = query.search.trim();
      where.OR = [
        { title: { contains: trimmed, mode: 'insensitive' } },
        { content: { contains: trimmed, mode: 'insensitive' } },
        { event: { contains: trimmed, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private levelToScore(level: KindnessLevel): number {
    switch (level) {
      case KindnessLevel.GOLDEN: return 0.95;
      case KindnessLevel.CHILDHOOD: return 0.85;
      case KindnessLevel.FAMILY: return 0.75;
      case KindnessLevel.WARM:
      default: return 0.6;
    }
  }

  private safeParseJson(text: string): Record<string, unknown> | null {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async calculateStreak(userId: string): Promise<number> {
    const memories = await this.prisma.kindnessMemory.findMany({
      where: { userId, isDeleted: false },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
      take: 100,
    });

    if (memories.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const m of memories) {
      if (!m.occurredAt) continue;
      const memDate = new Date(m.occurredAt);
      memDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currentDate.getTime() - memDate.getTime()) / 86400000);

      if (diffDays === 0) {
        streak++;
        currentDate = memDate;
      } else if (diffDays === 1) {
        // 前一天有记录，继续
        streak++;
        currentDate = memDate;
      } else {
        break;
      }
    }

    return streak;
  }

  private async generateStoryInBackground(userId: string, kindnessId: string): Promise<void> {
    await this.reconstructStory(userId, kindnessId);
  }

  private async invalidateCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`${REDIS_KEYS.AGENT_CACHE}kindness_stats:${userId}`);
    } catch {
      // ignore
    }
  }
}
