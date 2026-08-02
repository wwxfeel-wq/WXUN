import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 习惯分析结果 — 从用户最近交互日志中提取的模式。
 */
export interface HabitAnalysis {
  /** 偏好话题（家庭/工作/健康/育儿/情感/财务/旅行） */
  preferredTopics: string[];
  /** 平均消息长度分类 */
  avgMessageLength: 'short' | 'medium' | 'long';
  /** 情绪模式 */
  emotionalPattern: 'stable' | 'positive' | 'negative' | 'volatile';
  /** 活跃时段（morning/afternoon/evening/night） */
  activeTimeSlots: string[];
  /** 工具使用率分类 */
  toolUsageRate: 'low' | 'balanced' | 'high';
  /** 正式程度 */
  formalityLevel: 'casual' | 'neutral' | 'formal';
}

/**
 * buildHabitPrompt 接受的画像数据结构。
 * 与 Prisma UserHabitProfile 模型结构兼容。
 */
export interface HabitProfileData {
  preferredTopics: Prisma.JsonValue;
  avgMessageLength: string;
  emotionalPattern: string;
  activeTimeSlots: Prisma.JsonValue;
  toolUsageRate: string;
  formalityLevel: string;
}

/** 话题关键词分类表 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  家庭: ['家人', '父母', '孩子', '老婆', '老公', '儿子', '女儿', '家庭', '回家', '陪'],
  工作: ['工作', '公司', '项目', '老板', '同事', '加班', '上班', '会议', '任务', '汇报'],
  健康: ['身体', '医院', '生病', '运动', '锻炼', '体检', '睡觉', '失眠', '不舒服', '吃药'],
  育儿: ['教育', '学校', '作业', '成绩', '老师', '辅导', '学习', '考试', '幼儿园', '家长会'],
  情感: ['难过', '开心', '孤独', '想念', '爱情', '感情', '心情', '压力', '想念', '寂寞'],
  财务: ['钱', '工资', '理财', '投资', '开销', '存款', '房贷', '保险', '收入', '花销'],
  旅行: ['旅行', '旅游', '出去玩', '景点', '机票', '酒店', '度假', '打卡', '攻略', '出发'],
};

/** 正面情绪关键词 */
const POSITIVE_KEYWORDS = [
  '开心', '快乐', '高兴', '太好了', '幸福', '满足', '不错', '棒', '顺利', '好消息',
];

/** 负面情绪关键词 */
const NEGATIVE_KEYWORDS = [
  '难过', '烦', '累', '焦虑', '不开心', '孤独', '担心', '郁闷', '崩溃', '失望',
];

/** 口语词（随意风格） */
const CASUAL_KEYWORDS = [
  '哈哈', '嗯嗯', '啥', '咋', '咋办', '牛', '厉害', '666', '呵呵', '哦哦', '嘿嘿', '哎', '哇',
];

/** 敬语（正式风格） */
const FORMAL_KEYWORDS = [
  '您', '请问', '麻烦', '感谢', '辛苦', '请教', '恭', '烦请', '劳驾', '拜托',
];

/** 触发全量分析的对话间隔 */
const ANALYSIS_INTERVAL = 10;

/** 分析的最近消息条数 */
const ANALYSIS_LIMIT = 50;

/** 消息长度阈值（字符） */
const SHORT_THRESHOLD = 20;
const LONG_THRESHOLD = 100;

/** 工具使用率阈值（百分比） */
const LOW_TOOL_THRESHOLD = 0.2;
const HIGH_TOOL_THRESHOLD = 0.6;

/**
 * HabitAnalyzerService — 分析用户交互模式，构建自适应习惯画像。
 *
 * 通过扫描用户最近的 AgentExecutionLog 记录，提取话题偏好、
 * 消息长度、情绪模式、活跃时段、工具使用率和正式程度，
 * 将分析结果存入 UserHabitProfile 表。生成的习惯描述可注入
 * systemPrompt，让时墨的回复方式更贴合用户的交流习惯。
 */
@Injectable()
export class HabitAnalyzerService {
  private readonly logger = new Logger(HabitAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Public API
  // ============================================================

  /**
   * 分析用户最近 50 条 AgentExecutionLog，提取交互模式。
   *
   * @param userId 用户 ID
   * @returns 习惯分析结果
   */
  async analyzeHabits(userId: string): Promise<HabitAnalysis> {
    const logs = await this.prisma.agentExecutionLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: ANALYSIS_LIMIT,
      select: {
        message: true,
        toolResults: true,
        createdAt: true,
      },
    });

    if (logs.length === 0) {
      this.logger.debug(`No execution logs found for user ${userId}, returning defaults`);
      return {
        preferredTopics: [],
        avgMessageLength: 'medium',
        emotionalPattern: 'stable',
        activeTimeSlots: [],
        toolUsageRate: 'balanced',
        formalityLevel: 'neutral',
      };
    }

    const messages = logs.map((l) => l.message);
    const toolResults = logs.map((l) => l.toolResults);
    const timestamps = logs.map((l) => l.createdAt);

    const preferredTopics = this.detectTopics(messages);
    const avgMessageLength = this.detectMessageLength(messages);
    const emotionalPattern = this.detectEmotionalPattern(messages);
    const activeTimeSlots = this.detectTimeSlots(timestamps);
    const toolUsageRate = this.detectToolUsage(toolResults);
    const formalityLevel = this.detectFormality(messages);

    this.logger.debug(
      `Habit analysis for user ${userId}: topics=[${preferredTopics.join(',')}], ` +
        `length=${avgMessageLength}, emotion=${emotionalPattern}, ` +
        `slots=[${activeTimeSlots.join(',')}], tools=${toolUsageRate}, formality=${formalityLevel}`,
    );

    return {
      preferredTopics,
      avgMessageLength,
      emotionalPattern,
      activeTimeSlots,
      toolUsageRate,
      formalityLevel,
    };
  }

  /**
   * 获取或创建用户的习惯画像。
   * 首次访问时以默认值创建新记录。
   */
  async getHabitProfile(userId: string) {
    let profile = await this.prisma.userHabitProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      this.logger.log(`Creating habit profile for user: ${userId}`);
      profile = await this.prisma.userHabitProfile.create({
        data: { userId },
      });
    }

    return profile;
  }

  /**
   * 执行分析并更新数据库。
   *
   * 每次调用递增 conversationCount，每 10 次对话触发一次
   * 全量习惯分析并更新画像字段。
   *
   * @param userId 用户 ID
   * @returns 更新后的习惯画像
   */
  async updateHabitProfile(userId: string) {
    const profile = await this.getHabitProfile(userId);
    const newCount = profile.conversationCount + 1;

    // 每 ANALYSIS_INTERVAL 次对话触发一次全量分析
    if (newCount % ANALYSIS_INTERVAL === 0) {
      this.logger.log(
        `Triggering habit analysis for user ${userId} (conversation count: ${newCount})`,
      );

      const analysis = await this.analyzeHabits(userId);

      const updated = await this.prisma.userHabitProfile.update({
        where: { userId },
        data: {
          preferredTopics: analysis.preferredTopics as unknown as Prisma.InputJsonValue,
          avgMessageLength: analysis.avgMessageLength,
          emotionalPattern: analysis.emotionalPattern,
          activeTimeSlots: analysis.activeTimeSlots as unknown as Prisma.InputJsonValue,
          toolUsageRate: analysis.toolUsageRate,
          formalityLevel: analysis.formalityLevel,
          conversationCount: newCount,
        },
      });

      this.logger.debug(`Habit profile fully updated for user ${userId}`);
      return updated;
    }

    // 非分析轮次：仅递增计数
    return this.prisma.userHabitProfile.update({
      where: { userId },
      data: { conversationCount: newCount },
    });
  }

  /**
   * 构建习惯画像描述文本，用于注入 systemPrompt。
   *
   * 根据画像各字段生成自然语言描述，例如：
   * "用户偏好简洁回复，常聊家庭和健康话题，语气随意。深夜时段回复更安静。"
   *
   * @param habit 习惯画像数据
   * @returns 习惯描述文本
   */
  async buildHabitPrompt(habit: HabitProfileData): Promise<string> {
    const topics = this.parseJsonArray(habit.preferredTopics);
    const slots = this.parseJsonArray(habit.activeTimeSlots);

    const parts: string[] = [];

    // 消息长度偏好
    const lengthDesc: Record<string, string> = {
      short: '偏好简洁回复',
      medium: '偏好适中长度的回复',
      long: '偏好详细深入的回复',
    };
    parts.push(lengthDesc[habit.avgMessageLength] ?? '偏好适中长度的回复');

    // 话题偏好
    if (topics.length > 0) {
      parts.push(`常聊${topics.join('和')}话题`);
    }

    // 语气正式度
    const formalityDesc: Record<string, string> = {
      casual: '语气随意',
      neutral: '语气自然',
      formal: '语气偏正式',
    };
    parts.push(formalityDesc[habit.formalityLevel] ?? '语气自然');

    // 情绪模式
    const emotionDesc: Record<string, string> = {
      stable: '情绪平稳',
      positive: '情绪偏积极',
      negative: '近期情绪偏低落',
      volatile: '情绪波动较大',
    };
    const emotion = emotionDesc[habit.emotionalPattern];
    if (emotion) {
      parts.push(emotion);
    }

    // 工具使用率
    const toolDesc: Record<string, string> = {
      low: '较少依赖工具调用',
      balanced: '适度使用工具',
      high: '频繁使用工具',
    };
    const tool = toolDesc[habit.toolUsageRate];
    if (tool) {
      parts.push(tool);
    }

    let prompt = `用户${parts.join('，')}。`;

    // 活跃时段提示
    const slotDesc: Record<string, string> = {
      morning: '早晨',
      afternoon: '下午',
      evening: '晚上',
      night: '深夜',
    };
    if (slots.length > 0) {
      const slotNames = slots.map((s) => slotDesc[s] ?? s).join('和');
      prompt += `多在${slotNames}时段交流。`;
    }

    // 深夜特殊提示
    if (slots.includes('night')) {
      prompt += '深夜时段回复应更安静、温和。';
    }

    return prompt;
  }

  // ============================================================
  // Private: Detection Helpers
  // ============================================================

  /**
   * 基于消息关键词检测偏好话题。
   * 返回出现频率 >= 20% 的话题，按频率降序排列。
   */
  private detectTopics(messages: string[]): string[] {
    const topicCounts: Record<string, number> = {};

    for (const topic of Object.keys(TOPIC_KEYWORDS)) {
      topicCounts[topic] = 0;
    }

    for (const msg of messages) {
      for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        if (keywords.some((kw) => msg.includes(kw))) {
          topicCounts[topic]++;
        }
      }
    }

    const total = messages.length;
    const threshold = Math.max(1, Math.ceil(total * 0.2));

    return Object.entries(topicCounts)
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);
  }

  /**
   * 根据平均消息长度分类。
   * short: <20 字, medium: 20-100 字, long: >100 字
   */
  private detectMessageLength(messages: string[]): 'short' | 'medium' | 'long' {
    if (messages.length === 0) return 'medium';

    const avgLen =
      messages.reduce((sum, msg) => sum + msg.length, 0) / messages.length;

    if (avgLen < SHORT_THRESHOLD) return 'short';
    if (avgLen > LONG_THRESHOLD) return 'long';
    return 'medium';
  }

  /**
   * 基于消息情绪关键词检测情绪模式。
   * - stable: 正面和负面都很少
   * - positive: 正面明显多于负面
   * - negative: 负面明显多于正面
   * - volatile: 正面和负面都较多（情绪波动大）
   */
  private detectEmotionalPattern(
    messages: string[],
  ): 'stable' | 'positive' | 'negative' | 'volatile' {
    if (messages.length === 0) return 'stable';

    let positiveCount = 0;
    let negativeCount = 0;

    for (const msg of messages) {
      if (POSITIVE_KEYWORDS.some((kw) => msg.includes(kw))) positiveCount++;
      if (NEGATIVE_KEYWORDS.some((kw) => msg.includes(kw))) negativeCount++;
    }

    const total = messages.length;
    const positiveRate = positiveCount / total;
    const negativeRate = negativeCount / total;

    // 两者都 >= 25% → 情绪波动
    if (positiveRate >= 0.25 && negativeRate >= 0.25) return 'volatile';
    // 正面为主
    if (positiveRate > negativeRate && positiveRate >= 0.2) return 'positive';
    // 负面为主
    if (negativeRate > positiveRate && negativeRate >= 0.2) return 'negative';
    // 情绪平稳
    return 'stable';
  }

  /**
   * 根据消息时间戳分析活跃时段。
   * morning: 6-12, afternoon: 12-18, evening: 18-24, night: 0-6
   * 返回频率最高的时段（>= 25% 的消息）。
   */
  private detectTimeSlots(timestamps: Date[]): string[] {
    if (timestamps.length === 0) return [];

    const slotCounts: Record<string, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };

    for (const ts of timestamps) {
      const hour = ts.getHours();
      if (hour >= 6 && hour < 12) slotCounts.morning++;
      else if (hour >= 12 && hour < 18) slotCounts.afternoon++;
      else if (hour >= 18 && hour < 24) slotCounts.evening++;
      else slotCounts.night++;
    }

    const total = timestamps.length;
    const threshold = total * 0.25;

    return Object.entries(slotCounts)
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([slot]) => slot);
  }

  /**
   * 检测工具使用率。
   * 统计 toolResults 非空的比例。
   * low: <20%, balanced: 20-60%, high: >60%
   */
  private detectToolUsage(
    toolResults: unknown[],
  ): 'low' | 'balanced' | 'high' {
    if (toolResults.length === 0) return 'balanced';

    const nonEmpty = toolResults.filter((tr) => this.hasToolResults(tr)).length;
    const rate = nonEmpty / toolResults.length;

    if (rate < LOW_TOOL_THRESHOLD) return 'low';
    if (rate > HIGH_TOOL_THRESHOLD) return 'high';
    return 'balanced';
  }

  /**
   * 基于用词检测正式程度。
   * casual: 含口语词, neutral: 中性, formal: 含敬语
   */
  private detectFormality(messages: string[]): 'casual' | 'neutral' | 'formal' {
    if (messages.length === 0) return 'neutral';

    let casualCount = 0;
    let formalCount = 0;

    for (const msg of messages) {
      if (CASUAL_KEYWORDS.some((kw) => msg.includes(kw))) casualCount++;
      if (FORMAL_KEYWORDS.some((kw) => msg.includes(kw))) formalCount++;
    }

    if (casualCount > formalCount && casualCount > 0) return 'casual';
    if (formalCount > casualCount && formalCount > 0) return 'formal';
    return 'neutral';
  }

  // ============================================================
  // Private: Utility Helpers
  // ============================================================

  /**
   * 判断 toolResults 是否包含有效的工具调用结果。
   */
  private hasToolResults(toolResults: unknown): boolean {
    if (toolResults === null || toolResults === undefined) return false;
    if (Array.isArray(toolResults)) return toolResults.length > 0;
    if (typeof toolResults === 'object') {
      return Object.keys(toolResults as Record<string, unknown>).length > 0;
    }
    return true;
  }

  /**
   * 将 Prisma JsonValue 安全解析为 string[]。
   */
  private parseJsonArray(value: Prisma.JsonValue): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    return [];
  }
}
