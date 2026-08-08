import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const dbUrl = process.env.DATABASE_URL || '';
    const poolParams = 'connection_limit=10&pool_timeout=20';
    const urlWithPool = dbUrl && !dbUrl.includes('connection_limit')
      ? `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}${poolParams}`
      : dbUrl;
    super({
      ...(urlWithPool ? { datasources: { db: { url: urlWithPool } } } : {}),
      log: isProduction
        ? [{ emit: 'event', level: 'error' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma client connected to database');

    // Enable pgvector extension
    try {
      await this.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
      this.logger.log('pgvector extension enabled');
    } catch (error) {
      this.logger.warn('pgvector extension not available (expected on first run before migration)');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }

  /**
   * Execute raw SQL for vector operations (pgvector)
   *
   * Security: tableName and embeddingColumn are validated against whitelists
   * to prevent SQL injection. additionalWhere is restricted to safe characters.
   */
  async vectorSearch(
    tableName: string,
    embeddingColumn: string,
    queryVector: number[],
    options: {
      topK?: number;
      userId?: string;
      additionalWhere?: string;
    } = {},
  ): Promise<Array<Record<string, unknown>>> {
    // 白名单验证 — 防止 SQL 注入
    const ALLOWED_TABLES = ['memories', 'knowledge_chunks', 'memory_embeddings'];
    const ALLOWED_COLUMNS = ['embedding'];

    if (!ALLOWED_TABLES.includes(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    if (!ALLOWED_COLUMNS.includes(embeddingColumn)) {
      throw new Error(`Invalid embedding column: ${embeddingColumn}`);
    }

    const topK = options.topK ?? 10;
    const vectorStr = `[${queryVector.join(',')}]`;

    let whereClause = '';
    const params: unknown[] = [vectorStr, topK];

    if (options.userId) {
      whereClause = 'WHERE user_id = $3';
      params.push(options.userId);
    }

    if (options.additionalWhere) {
      // 验证 additionalWhere 只包含安全字符（字母、数字、下划线、点、空格、比较运算符）
      if (!/^[\w.\s=<>!,'()-]+$/.test(options.additionalWhere)) {
        throw new Error('Invalid additionalWhere clause: contains unsafe characters');
      }
      whereClause = whereClause
        ? `${whereClause} AND ${options.additionalWhere}`
        : `WHERE ${options.additionalWhere}`;
    }

    const sql = `
      SELECT *, 1 - (${embeddingColumn} <=> $1::vector) AS similarity
      FROM "${tableName}"
      ${whereClause}
      ORDER BY ${embeddingColumn} <=> $1::vector
      LIMIT $2
    `;

    return this.$queryRawUnsafe(sql, ...params);
  }
}
