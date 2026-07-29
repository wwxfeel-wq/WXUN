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
import { GeneratePersonalityDto } from './dto/generate-personality.dto';
import {
  ERROR_CODES,
  AgentType,
  AI_CONFIG,
  REDIS_KEYS,
  REDIS_TTL,
  PERSONALITY_DIMENSIONS,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** The Big Five personality scores returned by the AI */
interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  analysis?: string;
  traits?: Record<string, unknown>;
}

/** Result of a personality profile generation */
export interface GeneratedProfile {
  id: string;
  userId: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  traits: Prisma.JsonValue;
  analysis: string | null;
  createdAt: Date;
}

@Injectable()
export class PersonalityService {
  private readonly logger = new Logger(PersonalityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly promptService: PromptService,
  ) {}

  // ============================================================
  // Profile Retrieval
  // ============================================================

  /**
   * Get the current (latest) personality profile for the user.
   */
  async getCurrentProfile(userId: string) {
    const profile = await this.prisma.personalityProfile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!profile) {
      return {
        userId,
        hasProfile: false,
        message: '暂无个性分析数据，请先生成个性画像',
        dimensions: PERSONALITY_DIMENSIONS.map((d) => ({ ...d, score: 0.5 })),
      };
    }

    return {
      ...profile,
      hasProfile: true,
      dimensions: PERSONALITY_DIMENSIONS.map((d) => ({
        ...d,
        score: profile[d.key as keyof typeof profile] as number,
      })),
    };
  }

  /**
   * Get the history of personality profiles (snapshots over time).
   */
  async getHistory(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<unknown>> {
    const where = { userId };
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [items, total] = await Promise.all([
      this.prisma.personalityProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.personalityProfile.count({ where }),
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
   * Get the most recent personality snapshot (from the snapshot table).
   */
  async getLatestSnapshot(userId: string) {
    const snapshot = await this.prisma.personalitySnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotDate: 'desc' },
    });

    if (!snapshot) {
      return {
        userId,
        hasSnapshot: false,
        message: '暂无快照数据',
      };
    }

    return {
      ...snapshot,
      hasSnapshot: true,
      dimensions: PERSONALITY_DIMENSIONS.map((d) => ({
        ...d,
        score: snapshot[d.key as keyof typeof snapshot] as number,
      })),
    };
  }

  // ============================================================
  // Profile Generation
  // ============================================================

  /**
   * Generate a new personality profile by analyzing the user's recent
   * memories using the AI emotion agent. Computes Big Five scores and
   * stores the result, also creating a daily snapshot.
   */
  async generateProfile(userId: string, dto: GeneratePersonalityDto): Promise<GeneratedProfile> {
    const memoryLimit = dto.memoryLimit ?? 100;

    // Fetch recent memories for analysis
    const memories = await this.prisma.memory.findMany({
      where: { userId, isDeleted: false },
      orderBy: { occurredAt: 'desc' },
      take: memoryLimit,
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
        message: '没有足够的记忆数据来生成个性画像，请先记录一些记忆',
      });
    }

    // Build the memory summary for the AI prompt
    const memoryText = memories
      .map(
        (m) =>
          `- [${m.type}] ${m.title}: ${m.content}${
            m.emotion ? ` (情感: ${m.emotion})` : ''
          }`,
      )
      .join('\n');

    // Render the emotion agent prompt
    const systemPrompt = await this.promptService.render(AgentType.EMOTION_AGENT, {
      user_nickname: '用户',
      user_message: '请根据以下记忆生成大五人格分析',
      retrieved_memories: memoryText,
      recent_messages: '',
    });

    const analysisPrompt = `${systemPrompt}

请基于以下用户的记忆数据，分析其大五人格特征（Big Five Personality）。以 JSON 格式返回：
{
  "openness": 0.0-1.0,
  "conscientiousness": 0.0-1.0,
  "extraversion": 0.0-1.0,
  "agreeableness": 0.0-1.0,
  "neuroticism": 0.0-1.0,
  "analysis": "综合个性分析（中文，200-500字）",
  "traits": {
    "dominantEmotions": ["主要情感类型"],
    "communicationStyle": "沟通风格描述",
    "values": ["核心价值观"]
  }
}

用户记忆：
${memoryText}

只返回 JSON，不要其他内容。`;

    const messages: ChatMessage[] = [
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: '请生成大五人格画像分析' },
    ];

    let scores: BigFiveScores;
    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.3,
        maxTokens: AI_CONFIG.MAX_TOKENS,
      });

      scores = this.parsePersonalityResult(result.content);

      if (!this.validateScores(scores)) {
        throw new Error('Invalid personality scores returned by AI');
      }
    } catch (error) {
      this.logger.error(`Personality generation failed: ${(error as Error).message}`);
      // Fall back to heuristic scores computed from memory emotion data
      scores = this.computeHeuristicScores(memories);
      scores.analysis = '基于记忆情感的启发式分析（AI服务暂不可用）';
    }

    // Store the profile
    const profile = await this.prisma.personalityProfile.create({
      data: {
        userId,
        openness: scores.openness,
        conscientiousness: scores.conscientiousness,
        extraversion: scores.extraversion,
        agreeableness: scores.agreeableness,
        neuroticism: scores.neuroticism,
        traits: (scores.traits ?? null) as Prisma.InputJsonValue,
        analysis: scores.analysis ?? null,
      },
    });

    // Create or update a daily snapshot (avoid duplicates on the same day).
    // The PersonalitySnapshot table has an index (not a unique constraint)
    // on (userId, snapshotDate), so we use findFirst + create/update.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSnapshot = await this.prisma.personalitySnapshot.findFirst({
      where: { userId, snapshotDate: today },
      select: { id: true },
    });

    if (existingSnapshot) {
      await this.prisma.personalitySnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          openness: scores.openness,
          conscientiousness: scores.conscientiousness,
          extraversion: scores.extraversion,
          agreeableness: scores.agreeableness,
          neuroticism: scores.neuroticism,
          memoryCount: memories.length,
        },
      });
    } else {
      await this.prisma.personalitySnapshot.create({
        data: {
          userId,
          snapshotDate: today,
          openness: scores.openness,
          conscientiousness: scores.conscientiousness,
          extraversion: scores.extraversion,
          agreeableness: scores.agreeableness,
          neuroticism: scores.neuroticism,
          memoryCount: memories.length,
        },
      });
    }

    // Log the AI call
    await this.logAICall(userId, AgentType.EMOTION_AGENT);

    // Invalidate profile cache
    await this.invalidateProfileCache(userId);

    this.logger.log(`Personality profile generated for user: ${userId}`);

    return profile;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Parses the JSON response from the LLM into Big Five scores.
   */
  private parsePersonalityResult(text: string): BigFiveScores {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned) as BigFiveScores;

      return {
        openness: this.clampScore(parsed.openness),
        conscientiousness: this.clampScore(parsed.conscientiousness),
        extraversion: this.clampScore(parsed.extraversion),
        agreeableness: this.clampScore(parsed.agreeableness),
        neuroticism: this.clampScore(parsed.neuroticism),
        analysis: parsed.analysis,
        traits: parsed.traits,
      };
    } catch {
      this.logger.warn(`Failed to parse personality JSON: ${text.slice(0, 200)}`);
      return {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      };
    }
  }

  /**
   * Validates that all Big Five scores are present and within range.
   */
  private validateScores(scores: BigFiveScores): boolean {
    const required = [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ] as const;

    for (const key of required) {
      const value = scores[key];
      if (typeof value !== 'number' || isNaN(value) || value < 0 || value > 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clamps a score to the [0, 1] range.
   */
  private clampScore(value: unknown): number {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num)) return 0.5;
    return Math.min(Math.max(num, 0), 1);
  }

  /**
   * Computes heuristic Big Five scores from memory emotion data as a fallback
   * when the AI service is unavailable.
   *
   * - Neuroticism correlates with negative emotions (sadness, anger, fear).
   * - Extraversion correlates with positive social emotions (joy, love).
   * - Openness correlates with diverse memory types (reflection, achievement).
   * - Conscientiousness correlates with achievement and daily memories.
   * - Agreeableness correlates with relationship memories and gratitude.
   */
  private computeHeuristicScores(
    memories: Array<{
      type: string;
      emotion: string | null;
      emotionScore: number | null;
      importance: number | null;
    }>,
  ): BigFiveScores {
    const negativeEmotions = ['sadness', 'anger', 'fear', 'disgust', 'shame', 'guilt'];
    const positiveEmotions = ['joy', 'love', 'gratitude', 'hope', 'pride'];
    const total = memories.length;

    let negativeCount = 0;
    let positiveCount = 0;
    let reflectionCount = 0;
    let achievementCount = 0;
    let relationshipCount = 0;
    let dailyCount = 0;
    let importanceSum = 0;

    for (const m of memories) {
      if (m.emotion) {
        const emotion = m.emotion.toLowerCase();
        if (negativeEmotions.includes(emotion)) negativeCount++;
        if (positiveEmotions.includes(emotion)) positiveCount++;
      }
      if (m.type === 'reflection') reflectionCount++;
      if (m.type === 'achievement') achievementCount++;
      if (m.type === 'relationship') relationshipCount++;
      if (m.type === 'daily') dailyCount++;
      importanceSum += m.importance ?? 0.5;
    }

    return {
      neuroticism: total > 0 ? Math.min(negativeCount / total + 0.2, 1) : 0.5,
      extraversion: total > 0 ? Math.min(positiveCount / total + 0.3, 1) : 0.5,
      openness: total > 0 ? Math.min(reflectionCount / total + 0.4, 1) : 0.5,
      conscientiousness:
        total > 0 ? Math.min((achievementCount + dailyCount) / total + 0.3, 1) : 0.5,
      agreeableness: total > 0 ? Math.min(relationshipCount / total + 0.4, 1) : 0.5,
      analysis: `基于${total}条记忆的启发式分析。负面情感占比${(
        (negativeCount / total) *
        100
      ).toFixed(0)}%，正面情感占比${((positiveCount / total) * 100).toFixed(0)}%。`,
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

  /**
   * Invalidate the cached personality profile for a user.
   */
  private async invalidateProfileCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`${REDIS_KEYS.AGENT_CACHE}personality:${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate personality cache: ${(error as Error).message}`);
    }
  }
}
