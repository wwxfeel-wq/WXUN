import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryEntityDto } from './dto/query-entity.dto';
import {
  ERROR_CODES,
  EntityType,
  REDIS_KEYS,
  REDIS_TTL,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** A node in the knowledge graph visualization */
export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string | null;
  properties: Prisma.JsonValue;
}

/** An edge in the knowledge graph visualization */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
}

/** The complete knowledge graph for visualization */
export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // Entity Operations
  // ============================================================

  /**
   * List knowledge entities with pagination and optional type filter.
   */
  async listEntities(userId: string, query: QueryEntityDto): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.KnowledgeEntityWhereInput = { userId };
    if (query.type) {
      where.type = query.type;
    }

    const [items, total] = await Promise.all([
      this.prisma.knowledgeEntity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          _count: {
            select: {
              memoryEntities: true,
              sourceRelations: true,
              targetRelations: true,
            },
          },
        },
      }),
      this.prisma.knowledgeEntity.count({ where }),
    ]);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single knowledge entity by ID, including its relations
   * and associated memories.
   */
  async getEntity(userId: string, id: string) {
    const entity = await this.prisma.knowledgeEntity.findFirst({
      where: { id, userId },
      include: {
        memoryEntities: {
          include: {
            memory: {
              select: {
                id: true,
                title: true,
                type: true,
                occurredAt: true,
              },
            },
          },
          orderBy: { relevance: 'desc' },
        },
        sourceRelations: {
          include: {
            target: { select: { id: true, name: true, type: true } },
          },
        },
        targetRelations: {
          include: {
            source: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!entity) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '知识实体不存在',
      });
    }

    return entity;
  }

  /**
   * Search knowledge entities by name or description.
   */
  async searchEntities(userId: string, searchTerm: string, type?: string) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '搜索关键词不能为空',
      });
    }

    const trimmed = searchTerm.trim();
    const where: Prisma.KnowledgeEntityWhereInput = {
      userId,
      OR: [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { description: { contains: trimmed, mode: 'insensitive' } },
      ],
    };

    if (type) {
      const validTypes = Object.values(EntityType) as string[];
      if (!validTypes.includes(type)) {
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_PARAMS,
          message: '实体类型不正确',
        });
      }
      where.type = type;
    }

    return this.prisma.knowledgeEntity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: { memoryEntities: true },
        },
      },
    });
  }

  /**
   * Get all relations for a specific entity (both as source and target).
   */
  async getEntityRelations(userId: string, entityId: string) {
    const entity = await this.prisma.knowledgeEntity.findFirst({
      where: { id: entityId, userId },
      select: { id: true },
    });

    if (!entity) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '知识实体不存在',
      });
    }

    const [outgoing, incoming] = await Promise.all([
      this.prisma.knowledgeRelation.findMany({
        where: { sourceId: entityId },
        include: {
          target: {
            select: { id: true, name: true, type: true, description: true },
          },
        },
        orderBy: { weight: 'desc' },
      }),
      this.prisma.knowledgeRelation.findMany({
        where: { targetId: entityId },
        include: {
          source: {
            select: { id: true, name: true, type: true, description: true },
          },
        },
        orderBy: { weight: 'desc' },
      }),
    ]);

    return {
      entityId,
      outgoing: outgoing.map((r) => ({
        id: r.id,
        type: r.type,
        weight: r.weight,
        metadata: r.metadata,
        createdAt: r.createdAt,
        direction: 'outgoing',
        relatedEntity: r.target,
      })),
      incoming: incoming.map((r) => ({
        id: r.id,
        type: r.type,
        weight: r.weight,
        metadata: r.metadata,
        createdAt: r.createdAt,
        direction: 'incoming',
        relatedEntity: r.source,
      })),
    };
  }

  /**
   * Get the complete knowledge graph (nodes + edges) for visualization.
   * Results are cached in Redis for a short period.
   */
  async getKnowledgeGraph(userId: string, limit: number = 200): Promise<KnowledgeGraph> {
    const cacheKey = `${REDIS_KEYS.AGENT_CACHE}knowledge_graph:${userId}:${limit}`;
    const cached = await this.redis.getJSON<KnowledgeGraph>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch entities (nodes)
    const entities = await this.prisma.knowledgeEntity.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        properties: true,
      },
    });

    if (entities.length === 0) {
      return { nodes: [], edges: [] };
    }

    const entityIds = new Set(entities.map((e) => e.id));

    // Fetch relations (edges) where both source and target are in our entity set
    const relations = await this.prisma.knowledgeRelation.findMany({
      where: {
        sourceId: { in: Array.from(entityIds) },
        targetId: { in: Array.from(entityIds) },
      },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
        weight: true,
      },
    });

    const nodes: GraphNode[] = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      properties: e.properties,
    }));

    const edges: GraphEdge[] = relations.map((r) => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: r.type,
      weight: r.weight,
    }));

    const graph: KnowledgeGraph = { nodes, edges };

    await this.redis.setJSON(cacheKey, graph, REDIS_TTL.SHORT_CACHE);

    return graph;
  }

  // ============================================================
  // Internal Entity Creation (used by the Knowledge Agent)
  // ============================================================

  /**
   * Upsert a knowledge entity. If an entity with the same name and type
   * already exists for this user, it is updated; otherwise, a new one is created.
   * Returns the entity ID.
   */
  async upsertEntity(
    userId: string,
    name: string,
    type: string,
    description?: string,
    properties?: Record<string, unknown>,
  ): Promise<string> {
    const entity = await this.prisma.knowledgeEntity.upsert({
      where: {
        userId_name_type: {
          userId,
          name,
          type,
        },
      },
      update: {
        description: description ?? undefined,
        properties: (properties ?? undefined) as Prisma.InputJsonValue,
      },
      create: {
        userId,
        name,
        type,
        description: description ?? null,
        properties: (properties ?? undefined) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Invalidate graph cache
    await this.redis.del(`${REDIS_KEYS.AGENT_CACHE}knowledge_graph:${userId}:200`);

    return entity.id;
  }

  /**
   * Create or update a relation between two entities.
   */
  async upsertRelation(
    sourceId: string,
    targetId: string,
    type: string,
    weight: number = 1.0,
  ): Promise<void> {
    await this.prisma.knowledgeRelation.upsert({
      where: {
        sourceId_targetId_type: {
          sourceId,
          targetId,
          type,
        },
      },
      update: { weight },
      create: {
        sourceId,
        targetId,
        type,
        weight,
      },
    });
  }
}
