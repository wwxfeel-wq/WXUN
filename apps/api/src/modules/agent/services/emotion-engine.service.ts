import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 时墨的 6 维度情感模型。
 *
 * 每个维度取值 [0, 1]，基线值代表「自然休息态」。
 * 情感会随时间向基线衰减，并因用户消息内容而实时波动。
 * 维度含义：
 *  - warmth     温暖 — 亲切、关心的程度
 *  - curiosity  好奇 — 对用户话题的兴趣
 *  - calm       平静 — 沉稳、安定的状态
 *  - joy        愉悦 — 开心、积极的心情
 *  - nostalgia  怀旧 — 对过往的回味
 *  - concern    关切 — 对用户状态的担忧
 */
export interface EmotionDimensions {
  warmth: number;
  curiosity: number;
  calm: number;
  joy: number;
  nostalgia: number;
  concern: number;
}

/** 情感基线 — 衰减回归的目标值 */
const EMOTION_BASELINE: EmotionDimensions = {
  warmth: 0.7,
  curiosity: 0.3,
  calm: 0.6,
  joy: 0.3,
  nostalgia: 0.2,
  concern: 0.2,
};

/** 情感维度中文名称 */
const EMOTION_LABELS: Record<keyof EmotionDimensions, string> = {
  warmth: '温暖',
  curiosity: '好奇',
  calm: '平静',
  joy: '愉悦',
  nostalgia: '怀旧',
  concern: '关切',
};

/** 高亮维度时的回复风格指导 */
const EMOTION_GUIDANCE: Record<keyof EmotionDimensions, string> = {
  warmth: '保持温暖亲切',
  concern: '体现关切，先确认对方的状态',
  joy: '分享这份喜悦，语气轻快一些',
  nostalgia: '自然地回忆过去的美好细节',
  curiosity: '表现出好奇，可以适当追问',
  calm: '保持平静沉稳',
};

/** 关键词 → 情感增量规则 */
interface KeywordRule {
  keywords: string[];
  deltas: Partial<EmotionDimensions>;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ['家人', '回忆', '孩子', '父母'],
    deltas: { nostalgia: 0.3, warmth: 0.2 },
  },
  {
    keywords: ['难过', '累', '烦', '焦虑', '不开心'],
    deltas: { concern: 0.4, warmth: 0.2 },
  },
  {
    keywords: ['开心', '太好了', '终于', '成功'],
    deltas: { joy: 0.3, warmth: 0.1 },
  },
  {
    keywords: ['为什么', '怎么', '什么是'],
    deltas: { curiosity: 0.3 },
  },
];

/** 距上次对话超过此时间（毫秒）后触发 calm 增量 */
const LONG_GAP_MS = 30 * 60 * 1000;

/** 每次衰减向基线回归的比例 */
const DECAY_RATE = 0.05;

/** 生成 prompt 提示的维度阈值 */
const PROMPT_THRESHOLD = 0.6;

/**
 * EmotionEngineService — 维护时墨的 6 维度情感状态。
 *
 * 情感状态存储在 ShimoEmotionState 表中（每用户一条），
 * 会根据用户消息内容实时更新，并随时间向基线衰减。
 * 生成的情感描述可注入 systemPrompt，让时墨的回复风格
 * 随情感状态自然变化。
 */
@Injectable()
export class EmotionEngineService {
  private readonly logger = new Logger(EmotionEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Public API
  // ============================================================

  /**
   * 获取或创建用户的时墨情感状态。
   * 首次访问时以基线值创建新记录。
   */
  async getEmotionState(userId: string) {
    let state = await this.prisma.shimoEmotionState.findUnique({
      where: { userId },
    });

    if (!state) {
      this.logger.log(`Creating emotion state for user: ${userId}`);
      state = await this.prisma.shimoEmotionState.create({
        data: { userId },
      });
    }

    return state;
  }

  /**
   * 根据用户消息内容更新时墨的情感状态。
   *
   * 更新流程：
   *  1. 获取当前情感状态
   *  2. 应用时间衰减（向基线回归 5%）
   *  3. 检测长时间无对话 → calm +0.2
   *  4. 关键词检测 → 对应维度增量
   *  5. 合并外部情感分析（如有）
   *  6. 所有值 clamp 到 [0, 1] 并持久化
   *
   * @param userId          用户 ID
   * @param userMessage     用户消息原文
   * @param emotionAnalysis 可选的外部情感分析结果（绝对值，取 max 合并）
   */
  async updateEmotion(
    userId: string,
    userMessage: string,
    emotionAnalysis?: Partial<EmotionDimensions>,
  ) {
    const state = await this.getEmotionState(userId);

    // 提取当前 6 维度
    let dims: EmotionDimensions = {
      warmth: state.warmth,
      curiosity: state.curiosity,
      calm: state.calm,
      joy: state.joy,
      nostalgia: state.nostalgia,
      concern: state.concern,
    };

    // 1. 应用时间衰减
    dims = await this.applyDecay(dims);

    // 2. 检测长时间无对话
    const now = Date.now();
    const gapMs = now - state.updatedAt.getTime();
    if (gapMs > LONG_GAP_MS) {
      dims.calm = this.clamp(dims.calm + 0.2);
      this.logger.debug(
        `Long gap detected (${Math.round(gapMs / 60000)}min) for user ${userId}, calm boosted to ${dims.calm.toFixed(2)}`,
      );
    }

    // 3. 关键词检测
    if (userMessage && userMessage.length > 0) {
      for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some((kw) => userMessage.includes(kw))) {
          for (const [dim, delta] of Object.entries(rule.deltas)) {
            const key = dim as keyof EmotionDimensions;
            dims[key] = this.clamp(dims[key] + (delta as number));
          }
        }
      }
    }

    // 4. 合并外部情感分析（取 max，避免叠加溢出）
    if (emotionAnalysis) {
      for (const [dim, value] of Object.entries(emotionAnalysis)) {
        if (typeof value === 'number') {
          const key = dim as keyof EmotionDimensions;
          dims[key] = this.clamp(Math.max(dims[key], value));
        }
      }
    }

    // 5. 持久化
    const updated = await this.prisma.shimoEmotionState.update({
      where: { userId },
      data: {
        warmth: dims.warmth,
        curiosity: dims.curiosity,
        calm: dims.calm,
        joy: dims.joy,
        nostalgia: dims.nostalgia,
        concern: dims.concern,
      },
    });

    this.logger.debug(
      `Emotion updated for user ${userId}: warmth=${dims.warmth.toFixed(2)}, concern=${dims.concern.toFixed(2)}, joy=${dims.joy.toFixed(2)}`,
    );

    return updated;
  }

  /**
   * 情感衰减：所有维度向基线回归。
   * 每次调用将当前值与基线的距离缩短 5%。
   *
   * @param state 当前情感维度
   * @returns 衰减后的情感维度
   */
  async applyDecay(state: EmotionDimensions): Promise<EmotionDimensions> {
    const result: EmotionDimensions = { ...state };

    (Object.keys(EMOTION_BASELINE) as Array<keyof EmotionDimensions>).forEach(
      (dim) => {
        const baseline = EMOTION_BASELINE[dim];
        const current = result[dim];
        // 向基线移动 5% 的距离
        result[dim] = this.clamp(current + (baseline - current) * DECAY_RATE);
      },
    );

    return result;
  }

  /**
   * 构建情感描述文本，用于注入 systemPrompt。
   *
   * 只在某个维度 > 0.6 时才生成提示，避免在情感平稳时
   * 产生冗余指令。取最高维度作为主要风格指导。
   *
   * @param emotion 当前情感维度
   * @returns 情感描述文本，无高亮维度时返回空字符串
   */
  async buildEmotionPrompt(emotion: EmotionDimensions): Promise<string> {
    const dims = Object.keys(EMOTION_LABELS) as Array<keyof EmotionDimensions>;

    // 筛选 > 0.6 的维度，按值降序排列
    const highlighted = dims
      .filter((dim) => emotion[dim] > PROMPT_THRESHOLD)
      .sort((a, b) => emotion[b] - emotion[a]);

    if (highlighted.length === 0) {
      return '';
    }

    const stateDesc = highlighted
      .map((dim) => `${EMOTION_LABELS[dim]}(${emotion[dim].toFixed(2)})`)
      .join('、');

    // 取最高维度作为主要指导
    const topDim = highlighted[0];
    const guidance = EMOTION_GUIDANCE[topDim];

    return `当前时墨的情感状态：${stateDesc}。你的回复应${guidance}。`;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * 将数值限制在 [0, 1] 范围内。
   */
  private clamp(value: number): number {
    if (isNaN(value)) return 0;
    return Math.min(Math.max(value, 0), 1);
  }
}
