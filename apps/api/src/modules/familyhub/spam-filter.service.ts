import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

/**
 * 垃圾信息过滤结果
 */
export interface SpamFilterResult {
  /** 是否为垃圾信息 */
  isSpam: boolean;
  /** 过滤原因 */
  reason:
    | 'pass'
    | 'empty'
    | 'too_short'
    | 'pure_number'
    | 'meaningless_single'
    | 'repeat';
  /** 友好提示文案（垃圾信息时直接返回给用户，不调用 AI） */
  tip: string;
}

/**
 * 垃圾信息过滤服务
 *
 * 在调用 AI 之前检测用户消息是否为垃圾/无意义内容，
 * 避免浪费 AI 调用额度，同时给用户友好引导。
 *
 * 过滤规则：
 * 1. 纯数字、单字「好」「嗯」等无意义消息 → 提示用户说更多
 * 2. 重复消息（连续 3 次相同内容）→ 提示换话题
 * 3. 过短消息（少于 2 个字符）→ 引导展开
 * 4. 正常消息 → 通过
 */
@Injectable()
export class SpamFilterService {
  private readonly logger = new Logger(SpamFilterService.name);

  /** 无意义的单字/短语黑名单 */
  private readonly MEANINGLESS_WORDS = new Set([
    '好',
    '嗯',
    '哦',
    '啊',
    '哈',
    '唉',
    '嗨',
    '诶',
    '呃',
    '嘿',
    '呀',
    '哎',
    '噢',
    '呜',
    '哼',
    'ok',
    'OK',
    'Ok',
    '嗯嗯',
    '哦哦',
    '哈哈',
    '啊啊',
    '嗯哼',
    '好吧',
    '行吧',
    '可以',
    '收到',
    '了解',
    '知道',
  ]);

  /** 每个用户+Agent 的最近消息历史（用于按会话隔离重复检测） */
  private readonly messageHistory = new Map<string, { messages: string[]; lastUpdated: number }>();

  /** 每个会话保留的最大历史条数 */
  private readonly HISTORY_LIMIT = 10;

  /** 连续相同消息达到此次数即判定为重复 */
  private readonly REPEAT_THRESHOLD = 3;

  /** 历史条目过期时间（30 分钟无活动即清除） */
  private readonly HISTORY_TTL_MS = 30 * 60 * 1000;

  /**
   * 检测用户消息是否为垃圾/无意义内容
   *
   * @param message - 用户原始消息
   * @param agentCode - Agent 编码（用于按会话隔离重复检测）
   * @param userId - 用户 ID（用于按用户隔离重复检测，防止跨用户数据共享）
   * @returns 过滤结果，若 isSpam 为 true 则应直接返回 tip 给用户
   */
  filter(message: string, agentCode: string, userId: string): SpamFilterResult {
    const trimmed = (message ?? '').trim();
    const historyKey = `${userId}:${agentCode}`;

    // 1. 空消息
    if (!trimmed) {
      this.logger.debug(`消息被过滤 [${agentCode}]: 空消息`);
      return {
        isSpam: true,
        reason: 'empty',
        tip: '好像没收到你的消息呢，能再说一次吗？',
      };
    }

    // 2. 过短消息（少于 2 个字符）
    if (trimmed.length < 2) {
      this.logger.debug(`消息被过滤 [${agentCode}]: 过短 "${trimmed}"`);
      return {
        isSpam: true,
        reason: 'too_short',
        tip: '能多说一点吗？这样我能更好地帮到你～',
      };
    }

    // 3. 纯数字
    if (/^\d+$/.test(trimmed)) {
      this.logger.debug(`消息被过滤 [${agentCode}]: 纯数字 "${trimmed}"`);
      return {
        isSpam: true,
        reason: 'pure_number',
        tip: '光看到数字我有点懵，能补充一下背景或者想问的问题吗？',
      };
    }

    // 4. 无意义单字/短语
    if (this.MEANINGLESS_WORDS.has(trimmed)) {
      this.logger.debug(`消息被过滤 [${agentCode}]: 无意义回复 "${trimmed}"`);
      return {
        isSpam: true,
        reason: 'meaningless_single',
        tip: '收到啦～不过能展开说说你的需求吗？比如想问什么、遇到了什么问题？',
      };
    }

    // 5. 重复消息（连续 N 次相同内容）
    const entry = this.messageHistory.get(historyKey);
    const history = entry?.messages ?? [];
    const lastN = history.slice(-(this.REPEAT_THRESHOLD - 1));
    if (
      lastN.length === this.REPEAT_THRESHOLD - 1 &&
      lastN.every((m) => m === trimmed)
    ) {
      this.logger.warn(`消息被过滤 [${agentCode}]: 连续重复 ${this.REPEAT_THRESHOLD} 次 "${trimmed}"`);
      return {
        isSpam: true,
        reason: 'repeat',
        tip: '这条消息好像重复了好几次，要不要换个话题，或者补充一些新的信息让我更好地帮你？',
      };
    }

    // 通过过滤 —— 记录到会话历史，用于后续重复检测
    this.recordMessage(historyKey, trimmed);

    return { isSpam: false, reason: 'pass', tip: '' };
  }

  /**
   * 记录消息到会话历史（仅记录通过过滤的消息）
   */
  private recordMessage(historyKey: string, message: string): void {
    const entry = this.messageHistory.get(historyKey);
    const history = entry?.messages ?? [];
    history.push(message);
    // 超出上限时丢弃最早的消息
    if (history.length > this.HISTORY_LIMIT) {
      history.shift();
    }
    this.messageHistory.set(historyKey, { messages: history, lastUpdated: Date.now() });
  }

  /**
   * 清空指定用户+Agent 的消息历史
   *
   * 用于会话重置等场景。
   */
  clearHistory(userId: string, agentCode: string): void {
    this.messageHistory.delete(`${userId}:${agentCode}`);
  }

  /**
   * 定时清理过期的消息历史条目（每 30 分钟执行一次）
   * 移除超过 HISTORY_TTL_MS 没有活动的条目，防止内存泄漏
   */
  @Interval(30 * 60 * 1000)
  cleanupStaleHistory(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.messageHistory) {
      if (now - entry.lastUpdated > this.HISTORY_TTL_MS) {
        this.messageHistory.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`SpamFilter cleanup: removed ${removed} stale history entries`);
    }
  }
}
