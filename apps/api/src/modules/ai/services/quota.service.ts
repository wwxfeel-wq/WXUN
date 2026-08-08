import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  SUBSCRIPTION_LIMITS,
  ERROR_CODES,
} from '@echolife/shared';

/** Result of a quota check */
export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** The Redis quota key used during checkAndIncrement, for rollback via decrementUsage */
  quotaKey?: string;
}

/** Current usage information */
export interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
  resetAt: string;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Checks whether the user has remaining AI message quota for the current month.
   *
   * @param userId - The user ID
   * @returns Whether the request is allowed, remaining count, and the limit
   */
  async checkQuota(userId: string): Promise<QuotaCheckResult> {
    const tier = await this.getUserTier(userId);
    const limit = this.getLimit(tier);

    // Unlimited quota (lifetime tier)
    if (limit === Infinity) {
      return { allowed: true, remaining: Infinity, limit };
    }

    const used = await this.getUsedCount(userId);

    return {
      allowed: used < limit,
      remaining: Math.max(0, limit - used),
      limit,
    };
  }

  /**
   * Atomically checks quota and increments usage in a single Redis operation.
   *
   * Uses a Lua script to ensure the check-and-increment is atomic, preventing
   * concurrent requests from bypassing the quota limit (TOCTOU race condition).
   *
   * @param userId - The user ID
   * @returns Whether the request is allowed, remaining count, and the limit
   */
  async checkAndIncrement(userId: string): Promise<QuotaCheckResult> {
    const tier = await this.getUserTier(userId);
    const limit = this.getLimit(tier);

    // Unlimited quota (lifetime tier) — just increment
    if (limit === Infinity) {
      const key = this.getQuotaKey(userId);
      await this.incrementUsage(userId);
      return { allowed: true, remaining: Infinity, limit, quotaKey: key };
    }

    const key = this.getQuotaKey(userId);
    const ttlSeconds = this.getSecondsUntilMonthEnd();
    const client = this.redis.getClient;

    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      if current > tonumber(ARGV[2]) then
        redis.call('DECR', KEYS[1])
        return {0, current - 1}
      end
      return {1, current}
    `;

    const result = (await client.eval(script, 1, key, String(ttlSeconds), String(limit))) as number[];
    const allowed = result[0] === 1;
    const used = result[1];

    return {
      allowed,
      remaining: Math.max(0, limit - used),
      limit,
      quotaKey: key,
    };
  }

  /**
   * Increments the user's monthly AI message usage counter.
   * Should be called after a successful AI interaction.
   *
   * @param userId - The user ID
   */
  async incrementUsage(userId: string): Promise<void> {
    const key = this.getQuotaKey(userId);
    const client = this.redis.getClient;
    const current = await client.incr(key);

    // Set TTL on first increment of the month
    if (current === 1) {
      const ttlSeconds = this.getSecondsUntilMonthEnd();
      await client.expire(key, ttlSeconds);
    }

    this.logger.debug(`Usage incremented for user ${userId}: ${current}`);
  }

  /**
   * Decrements the user's monthly AI message usage counter.
   * Used to roll back quota increments when a request fails after
   * the quota was already incremented.
   *
   * Accepts the quota key returned by checkAndIncrement to avoid
   * cross-month boundary issues where getQuotaKey would generate
   * a different key after midnight.
   *
   * @param quotaKey - The Redis quota key returned by checkAndIncrement
   */
  async decrementUsage(quotaKey: string): Promise<void> {
    const client = this.redis.getClient;
    await client.decr(quotaKey);
    this.logger.debug(`Usage decremented for key ${quotaKey}`);
  }

  /**
   * Gets the current usage details for a user.
   *
   * @param userId - The user ID
   * @returns Usage stats including used count, limit, remaining, tier, and reset time
   */
  async getUsage(userId: string): Promise<QuotaUsage> {
    const tier = await this.getUserTier(userId);
    const limit = this.getLimit(tier);
    const used = await this.getUsedCount(userId);

    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);

    return {
      used,
      limit,
      remaining,
      tier,
      resetAt: this.getMonthEndISO(),
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Gets the user's subscription tier from the database.
   * Defaults to 'free' if no active subscription exists.
   */
  private async getUserTier(userId: string): Promise<string> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true },
    });

    if (!subscription || subscription.status !== 'active') {
      return 'free';
    }

    return subscription.tier;
  }

  /**
   * Gets the monthly AI message limit for a subscription tier.
   */
  private getLimit(tier: string): number {
    const limits = SUBSCRIPTION_LIMITS[tier as keyof typeof SUBSCRIPTION_LIMITS];
    if (!limits) {
      return SUBSCRIPTION_LIMITS.free.monthlyAIMessages;
    }
    return limits.monthlyAIMessages;
  }

  /**
   * Gets the current usage count from Redis.
   */
  private async getUsedCount(userId: string): Promise<number> {
    const key = this.getQuotaKey(userId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Builds the Redis key for monthly quota tracking.
   * Format: ai_quota:{userId}:{YYYY-MM}
   */
  private getQuotaKey(userId: string): string {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `ai_quota:${userId}:${monthKey}`;
  }

  /**
   * Calculates seconds remaining until the end of the current month.
   */
  private getSecondsUntilMonthEnd(): number {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000);
  }

  /**
   * Gets the ISO string for the end of the current month.
   */
  private getMonthEndISO(): string {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return endOfMonth.toISOString();
  }
}
