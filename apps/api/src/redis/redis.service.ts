import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_KEYS, REDIS_TTL } from '@echolife/shared';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Redis connection retries exhausted');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
    this.logger.log('Redis client disconnected');
  }

  get getClient(): Redis {
    return this.client;
  }

  // ===== Basic Operations =====

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  // ===== JSON Operations =====

  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const jsonStr = JSON.stringify(value);
    await this.set(key, jsonStr, ttlSeconds);
  }

  // ===== Working Memory (Redis-based short-term context) =====

  async setWorkingMemory(userId: string, data: unknown): Promise<void> {
    const key = `${REDIS_KEYS.WORKING_MEMORY}${userId}`;
    await this.setJSON(key, data, REDIS_TTL.WORKING_MEMORY);
  }

  async getWorkingMemory<T>(userId: string): Promise<T | null> {
    const key = `${REDIS_KEYS.WORKING_MEMORY}${userId}`;
    return this.getJSON<T>(key);
  }

  async clearWorkingMemory(userId: string): Promise<void> {
    const key = `${REDIS_KEYS.WORKING_MEMORY}${userId}`;
    await this.del(key);
  }

  // ===== Rate Limiting =====

  async checkRateLimit(
    identifier: string,
    limit: number,
    ttlSeconds: number = REDIS_TTL.RATE_LIMIT,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const key = `${REDIS_KEYS.RATE_LIMIT}${identifier}`;
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, ttlSeconds);
    }

    const ttl = await this.client.ttl(key);
    const remaining = Math.max(0, limit - current);

    return {
      allowed: current <= limit,
      remaining,
      resetAt: Date.now() + ttl * 1000,
    };
  }

  // ===== Refresh Token Storage =====

  async storeRefreshToken(userId: string, tokenId: string, expiresInSeconds: number): Promise<void> {
    const key = `${REDIS_KEYS.REFRESH_TOKEN}${userId}:${tokenId}`;
    await this.set(key, 'valid', expiresInSeconds);
  }

  async validateRefreshToken(userId: string, tokenId: string): Promise<boolean> {
    const key = `${REDIS_KEYS.REFRESH_TOKEN}${userId}:${tokenId}`;
    return this.exists(key);
  }

  async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    const key = `${REDIS_KEYS.REFRESH_TOKEN}${userId}:${tokenId}`;
    await this.del(key);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const pattern = `${REDIS_KEYS.REFRESH_TOKEN}${userId}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  // ===== Cache Helpers =====

  async cacheGet<T>(key: string): Promise<T | null> {
    return this.getJSON<T>(key);
  }

  async cacheSet<T>(key: string, value: T, ttlSeconds: number = REDIS_TTL.MEDIUM_CACHE): Promise<void> {
    await this.setJSON(key, value, ttlSeconds);
  }

  async cacheInvalidate(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
