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
