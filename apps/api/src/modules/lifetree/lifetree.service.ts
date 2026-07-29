import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ERROR_CODES, LifeTreeNodeType, REDIS_KEYS, REDIS_TTL } from '@echolife/shared';

/** A life tree node with its children loaded recursively */
export interface LifeTreeNodeWithChildren {
  id: string;
  userId: string;
  parentId: string | null;
  type: string;
  title: string;
  description: string | null;
  metadata: Prisma.JsonValue;
  memoryCount: number;
  memoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children: LifeTreeNodeWithChildren[];
}

/** Payload for linking a memory to a node */
export interface LinkMemoryPayload {
  memoryId: string;
}

/** Real-world derived life tree growth statistics. */
export interface TreeGrowthStats {
  treeLevel: number;
  treeStage: string;
  treeGrowth: number;
  familyMembers: number;
  memoryCount: number;
  knowledgeRootCount: number;
  storyCount: number;
  timeCapsuleCount: number;
  milestoneCount: number;
  interviewCount: number;
}

@Injectable()
export class LifeTreeService {
  private readonly logger = new Logger(LifeTreeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // Tree Retrieval
  // ============================================================

  /**
   * Returns the full life tree for a user as a nested tree structure.
   * Root nodes (parentId is null) are at the top level, with children
   * loaded recursively.
   */
  async getTree(userId: string): Promise<LifeTreeNodeWithChildren[]> {
    const cacheKey = `${REDIS_KEYS.AGENT_CACHE}life_tree:${userId}`;
    const cached = await this.redis.getJSON<LifeTreeNodeWithChildren[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all nodes for the user in a single query
    const allNodes = await this.prisma.lifeTreeNode.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Build the tree recursively in memory
    const tree = this.buildTree(allNodes);

    await this.redis.setJSON(cacheKey, tree, REDIS_TTL.SHORT_CACHE);

    return tree;
  }

  /**
   * Get nodes filtered by type (flat list, no nesting).
   */
  async getNodesByType(userId: string, type: string) {
    const validTypes = Object.values(LifeTreeNodeType) as string[];
    if (!validTypes.includes(type)) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: `节点类型不正确，可选值: ${validTypes.join(', ')}`,
      });
    }

    return this.prisma.lifeTreeNode.findMany({
      where: { userId, type },
      orderBy: { createdAt: 'asc' },
      include: {
        memory: { select: { id: true, title: true } },
      },
    });
  }

  // ============================================================
  // Node CRUD
  // ============================================================

  /**
   * Create a new life tree node. If parentId is provided, validates that
   * the parent exists and belongs to the user.
   */
  async createNode(userId: string, dto: CreateNodeDto) {
    // Validate parent if provided
    if (dto.parentId) {
      const parent = await this.prisma.lifeTreeNode.findFirst({
        where: { id: dto.parentId, userId },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: '父节点不存在',
        });
      }
    }

    // If no parent and no explicit root type, default to root type
    const nodeType = dto.type ?? (dto.parentId ? LifeTreeNodeType.CATEGORY : LifeTreeNodeType.ROOT);

    const node = await this.prisma.lifeTreeNode.create({
      data: {
        userId,
        parentId: dto.parentId ?? null,
        type: nodeType,
        title: dto.title,
        description: dto.description ?? null,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Life tree node created: ${node.id} for user: ${userId}`);

    await this.invalidateTreeCache(userId);

    return node;
  }

  /**
   * Update a life tree node by ID.
   */
  async updateNode(userId: string, id: string, dto: UpdateNodeDto) {
    const existing = await this.prisma.lifeTreeNode.findFirst({
      where: { id, userId },
      select: { id: true, parentId: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '节点不存在',
      });
    }

    // Validate new parent if being moved
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_PARAMS,
          message: '不能将节点设为自身的子节点',
        });
      }

      const parent = await this.prisma.lifeTreeNode.findFirst({
        where: { id: dto.parentId, userId },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException({
          code: ERROR_CODES.NOT_FOUND,
          message: '父节点不存在',
        });
      }

      // Prevent circular references: check the new parent is not a descendant
      await this.ensureNoCircularReference(id, dto.parentId);
    }

    const data: Prisma.LifeTreeNodeUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.metadata !== undefined) data.metadata = dto.metadata as Prisma.InputJsonValue;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.lifeTreeNode.update({
      where: { id },
      data,
    });

    this.logger.log(`Life tree node updated: ${id}`);

    await this.invalidateTreeCache(userId);

    return updated;
  }

  /**
   * Delete a life tree node. Child nodes are re-parented to the deleted
   * node's parent (or become root nodes if the deleted node was a root).
   */
  async deleteNode(userId: string, id: string): Promise<void> {
    const node = await this.prisma.lifeTreeNode.findFirst({
      where: { id, userId },
      select: { id: true, parentId: true },
    });

    if (!node) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '节点不存在',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Re-parent children to the deleted node's parent
      await tx.lifeTreeNode.updateMany({
        where: { parentId: id, userId },
        data: { parentId: node.parentId },
      });

      // Delete the node
      await tx.lifeTreeNode.delete({
        where: { id },
      });
    });

    this.logger.log(`Life tree node deleted: ${id}`);

    await this.invalidateTreeCache(userId);
  }

  // ============================================================
  // Memory Linking
  // ============================================================

  /**
   * Link a memory to a life tree node. Each node can only be linked to
   * one memory (unique constraint on memoryId).
   */
  async linkMemory(userId: string, nodeId: string, payload: LinkMemoryPayload) {
    const node = await this.prisma.lifeTreeNode.findFirst({
      where: { id: nodeId, userId },
      select: { id: true, memoryId: true },
    });

    if (!node) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '节点不存在',
      });
    }

    // Validate the memory belongs to the user and is not deleted
    const memory = await this.prisma.memory.findFirst({
      where: { id: payload.memoryId, userId, isDeleted: false },
      select: { id: true },
    });

    if (!memory) {
      throw new NotFoundException({
        code: ERROR_CODES.MEMORY_NOT_FOUND,
        message: '记忆不存在或已被删除',
      });
    }

    // Check if the memory is already linked to another node
    const existingLink = await this.prisma.lifeTreeNode.findFirst({
      where: { memoryId: payload.memoryId, userId },
      select: { id: true },
    });

    if (existingLink && existingLink.id !== nodeId) {
      throw new BadRequestException({
        code: ERROR_CODES.CONFLICT,
        message: '该记忆已关联到其他节点，请先取消原有关联',
      });
    }

    const updated = await this.prisma.lifeTreeNode.update({
      where: { id: nodeId },
      data: {
        memoryId: payload.memoryId,
        memoryCount: { increment: 1 },
      },
      include: {
        memory: { select: { id: true, title: true, type: true } },
      },
    });

    this.logger.log(`Memory ${payload.memoryId} linked to node ${nodeId}`);

    await this.invalidateTreeCache(userId);

    return updated;
  }

  // ============================================================
  // Tree Growth Stats
  // ============================================================

  /**
   * Compute organic family life tree growth stats from real user data.
   *
   * Data metaphor:
   * - Roots  : long-term memories + knowledge entities
   * - Trunk  : overall growth level/stage
   * - Branches: family members
   * - Leaves : stories/memories
   * - Flowers: milestones (completed interviews + high-importance memories)
   * - Fruits : time capsules
   */
  async getTreeGrowthStats(userId: string): Promise<TreeGrowthStats> {
    const [
      memoryCount,
      storyCount,
      interviewCount,
      completedInterviews,
      highImportanceMemories,
      timeCapsuleCount,
      knowledgeEntityCount,
      familyMemberCount,
    ] = await Promise.all([
      this.prisma.memory.count({ where: { userId, isDeleted: false } }),
      this.prisma.memory.count({
        where: { userId, isDeleted: false, type: 'story' },
      }),
      this.prisma.interview.count({ where: { userId } }),
      this.prisma.interview.count({
        where: { userId, status: 'completed' },
      }),
      this.prisma.memory.count({
        where: {
          userId,
          isDeleted: false,
          importance: { gte: 0.8 },
        },
      }),
      this.prisma.timeCapsule.count({ where: { userId } }),
      this.prisma.knowledgeEntity.count({ where: { userId } }),
      this.prisma.familyMember.count({ where: { userId } }),
    ]);

    const knowledgeRootCount = memoryCount + knowledgeEntityCount;
    const milestoneCount = completedInterviews + highImportanceMemories;

    // Growth score: memories + interviews*2 + capsules*3 + milestones*2 + familyMembers*3
    const score =
      memoryCount +
      interviewCount * 2 +
      timeCapsuleCount * 3 +
      milestoneCount * 2 +
      familyMemberCount * 3;

    const stages = [
      { name: 'Seed', min: 0, max: 1 },
      { name: 'Sprout', min: 1, max: 20 },
      { name: 'Young Tree', min: 20, max: 80 },
      { name: 'Mature Tree', min: 80, max: 200 },
      { name: 'Bloom', min: 200, max: 400 },
      { name: 'Fruit', min: 400, max: 700 },
      { name: 'Eternal', min: 700, max: 700 },
    ] as const;

    let stageIndex = 0;
    for (let i = 0; i < stages.length; i++) {
      if (score >= stages[i].min) {
        stageIndex = i;
      }
    }

    const stage = stages[stageIndex];
    const isMax = stageIndex === stages.length - 1;
    const progress = isMax
      ? 1
      : Math.min(
          0.99,
          Math.max(0, (score - stage.min) / (stage.max - stage.min)),
        );

    return {
      treeLevel: Math.min(20, 1 + Math.floor(score / 50)),
      treeStage: stage.name,
      treeGrowth: progress,
      familyMembers: Math.max(1, familyMemberCount),
      memoryCount,
      knowledgeRootCount,
      storyCount,
      timeCapsuleCount,
      milestoneCount,
      interviewCount,
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Recursively builds a tree structure from a flat list of nodes.
   */
  private buildTree(
    nodes: Array<Prisma.LifeTreeNodeGetPayload<{}>>,
  ): LifeTreeNodeWithChildren[] {
    const nodeMap = new Map<string, LifeTreeNodeWithChildren>();
    const roots: LifeTreeNodeWithChildren[] = [];

    // First pass: create all node entries in the map
    for (const node of nodes) {
      nodeMap.set(node.id, {
        id: node.id,
        userId: node.userId,
        parentId: node.parentId,
        type: node.type,
        title: node.title,
        description: node.description,
        metadata: node.metadata,
        memoryCount: node.memoryCount,
        memoryId: node.memoryId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        children: [],
      });
    }

    // Second pass: build parent-child relationships
    for (const node of nodes) {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  }

  /**
   * Ensures that assigning a new parent does not create a circular
   * reference in the tree. Walks up the ancestor chain from the proposed
   * new parent to check it never reaches the node being moved.
   */
  private async ensureNoCircularReference(nodeId: string, newParentId: string): Promise<void> {
    let currentParentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentParentId) {
      if (currentParentId === nodeId) {
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_PARAMS,
          message: '不能将节点移动到其子节点下，这会造成循环引用',
        });
      }

      if (visited.has(currentParentId)) {
        // Already detected a cycle in the existing data; stop traversal
        break;
      }
      visited.add(currentParentId);

      const parentNode: { parentId: string | null } | null =
        await this.prisma.lifeTreeNode.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });

      currentParentId = parentNode?.parentId ?? null;
    }
  }

  /**
   * Invalidate the cached life tree for a user.
   */
  private async invalidateTreeCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`${REDIS_KEYS.AGENT_CACHE}life_tree:${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate life tree cache: ${(error as Error).message}`);
    }
  }
}
