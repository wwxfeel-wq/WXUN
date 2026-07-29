import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
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
    const topK = options.topK ?? 10;
    const vectorStr = `[${queryVector.join(',')}]`;

    let whereClause = '';
    const params: unknown[] = [vectorStr, topK];

    if (options.userId) {
      whereClause = 'WHERE user_id = $3';
      params.push(options.userId);
    }

    if (options.additionalWhere) {
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
