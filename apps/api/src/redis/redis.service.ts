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
      lazyConnect: true,
      keepAlive: 30000,
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

    this.connectWithRetry().catch((error) => {
      this.logger.error(`Redis initial connection failed after all retries: ${error.message}`);
    });
  }

  /**
   * R3-BUG-010: Connect to Redis with exponential backoff retry.
   * Retries: 5 times with delays 3s, 6s, 12s, 24s, 30s.
   */
  private async connectWithRetry(): Promise<void> {
    const maxRetries = 5;
    const delays = [3000, 6000, 12000, 24000, 30000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.client.connect();
        this.logger.log('Redis connection established successfully');
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = delays[attempt];
        this.logger.warn(
          `Redis connection attempt ${attempt + 1}/${maxRetries + 1} failed: ${(error as Error).message}. Retrying in ${delay / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
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

  async getDel(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  // ===== JSON Operations =====

  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(`Failed to parse JSON for key "${key}": ${(error as Error).message}. Returning null.`);
      return null;
    }
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

    // R3-BUG-015: Use a Lua script to make INCR+EXPIRE atomic, preventing the
    // race condition where a crash between INCR and EXPIRE leaves a key without TTL.
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      return {current, ttl}
    `;

    const result = (await this.client.eval(script, 1, key, String(ttlSeconds))) as [number, number];
    const current = result[0];
    const ttl = result[1];

    const remaining = Math.max(0, limit - current);

    // Guard against negative TTL (key expired between INCR and TTL, or error)
    const resetAt = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + ttlSeconds * 1000;

    return {
      allowed: current <= limit,
      remaining,
      resetAt,
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
    const keys = await this.scanKeys(pattern);
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
    const keys = await this.scanKeys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor, 'MATCH', pattern, 'COUNT', 100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
