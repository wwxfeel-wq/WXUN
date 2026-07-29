import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { ShareMemoryDto } from './dto/share-memory.dto';
import { QuerySharedMemoryDto } from './dto/query-shared-memory.dto';
import {
  ERROR_CODES,
  FamilyRole,
  ConfirmationStatus,
  REDIS_KEYS,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** Payload for joining a family via invite code */
export interface JoinFamilyPayload {
  inviteCode: string;
}

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // Family Lifecycle
  // ============================================================

  /**
   * Create a new family group. The creator becomes the family admin.
   * Also generates an invite code stored in Redis for joining.
   */
  async createFamily(userId: string, dto: CreateFamilyDto) {
    const family = await this.prisma.$transaction(async (tx) => {
      const newFamily = await tx.family.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          creatorId: userId,
        },
      });

      // Add the creator as an admin member
      await tx.familyMember.create({
        data: {
          familyId: newFamily.id,
          userId,
          role: FamilyRole.ADMIN,
        },
      });

      return newFamily;
    });

    // Generate and store an invite code in Redis (valid for 30 days)
    const inviteCode = this.generateInviteCode();
    await this.redis.set(
      `${REDIS_KEYS.SESSION}family_invite:${inviteCode}`,
      family.id,
      30 * 24 * 60 * 60,
    );

    this.logger.log(`Family created: ${family.id} by user: ${userId}`);

    return {
      ...family,
      inviteCode,
      memberCount: 1,
    };
  }

  /**
   * Join a family using an invite code.
   */
  async joinFamily(userId: string, payload: JoinFamilyPayload) {
    const familyId = await this.redis.get(
      `${REDIS_KEYS.SESSION}family_invite:${payload.inviteCode}`,
    );

    if (!familyId) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '邀请码无效或已过期',
      });
    }

    // Check if already a member
    const existing = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: '您已经是该家庭成员',
      });
    }

    const member = await this.prisma.familyMember.create({
      data: {
        familyId,
        userId,
        role: FamilyRole.MEMBER,
      },
      include: {
        family: true,
      },
    });

    this.logger.log(`User ${userId} joined family ${familyId}`);

    return {
      id: member.id,
      familyId: member.familyId,
      role: member.role,
      joinedAt: member.joinedAt,
      family: member.family,
    };
  }

  /**
   * Leave a family. If the user is the only admin, the family is
   * reassigned to another member or deleted if no members remain.
   */
  async leaveFamily(userId: string, familyId: string) {
    const member = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '您不是该家庭成员',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Remove the member
      await tx.familyMember.delete({
        where: { id: member.id },
      });

      // If the user was an admin, check remaining members
      if (member.role === FamilyRole.ADMIN) {
        const remainingAdmins = await tx.familyMember.count({
          where: { familyId, role: FamilyRole.ADMIN },
        });

        if (remainingAdmins === 0) {
          // Promote the oldest remaining member to admin, or delete the family
          const oldestMember = await tx.familyMember.findFirst({
            where: { familyId },
            orderBy: { joinedAt: 'asc' },
          });

          if (oldestMember) {
            await tx.familyMember.update({
              where: { id: oldestMember.id },
              data: { role: FamilyRole.ADMIN },
            });
          } else {
            // No members left, delete the family
            await tx.family.delete({
              where: { id: familyId },
            });
          }
        }
      }
    });

    this.logger.log(`User ${userId} left family ${familyId}`);
  }

  /**
   * Get a family by ID with member count.
   */
  async getFamily(userId: string, familyId: string) {
    // Ensure the user is a member
    await this.ensureMembership(userId, familyId);

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: {
        _count: {
          select: { members: true, familyMemories: true },
        },
      },
    });

    if (!family) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '家庭不存在',
      });
    }

    return {
      ...family,
      memberCount: family._count.members,
      sharedMemoryCount: family._count.familyMemories,
    };
  }

  /**
   * List all members of a family.
   */
  async listMembers(userId: string, familyId: string) {
    await this.ensureMembership(userId, familyId);

    return this.prisma.familyMember.findMany({
      where: { familyId },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: { nickname: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // ============================================================
  // Shared Memories
  // ============================================================

  /**
   * Share a memory to a family (creates a FamilyMemory record).
   */
  async shareMemory(userId: string, familyId: string, dto: ShareMemoryDto) {
    await this.ensureMembership(userId, familyId);

    // Validate the memory belongs to the user
    const memory = await this.prisma.memory.findFirst({
      where: { id: dto.memoryId, userId, isDeleted: false },
      select: { id: true, visibility: true },
    });

    if (!memory) {
      throw new NotFoundException({
        code: ERROR_CODES.MEMORY_NOT_FOUND,
        message: '记忆不存在或已被删除',
      });
    }

    // Check if already shared
    const existing = await this.prisma.familyMemory.findFirst({
      where: { familyId, memoryId: dto.memoryId },
    });

    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: '该记忆已分享到此家庭',
      });
    }

    const familyMemory = await this.prisma.familyMemory.create({
      data: {
        familyId,
        memoryId: dto.memoryId,
        contributorId: userId,
        confirmationStatus: ConfirmationStatus.PENDING,
      },
      include: {
        memory: {
          select: { id: true, title: true, content: true, type: true, occurredAt: true },
        },
      },
    });

    this.logger.log(`Memory ${dto.memoryId} shared to family ${familyId} by user ${userId}`);

    return familyMemory;
  }

  /**
   * Confirm a shared memory (mark as confirmed).
   */
  async confirmMemory(userId: string, familyMemoryId: string) {
    const familyMemory = await this.prisma.familyMemory.findUnique({
      where: { id: familyMemoryId },
      include: { family: true },
    });

    if (!familyMemory) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '家庭记忆不存在',
      });
    }

    // Ensure the user is a member of the family
    await this.ensureMembership(userId, familyMemory.familyId);

    // Cannot confirm your own memory
    if (familyMemory.contributorId === userId) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '不能确认自己分享的记忆',
      });
    }

    if (familyMemory.confirmationStatus === ConfirmationStatus.CONFIRMED) {
      return { success: true, message: '该记忆已被确认' };
    }

    // Update the family memory status and create a confirmation record
    await this.prisma.$transaction(async (tx) => {
      await tx.familyMemory.update({
        where: { id: familyMemoryId },
        data: { confirmationStatus: ConfirmationStatus.CONFIRMED },
      });

      // Create or update the confirmation record (unique constraint)
      await tx.familyMemoryConfirmation.upsert({
        where: {
          familyMemoryId_confirmerId: {
            familyMemoryId,
            confirmerId: userId,
          },
        },
        update: { status: ConfirmationStatus.CONFIRMED },
        create: {
          familyMemoryId,
          confirmerId: userId,
          status: ConfirmationStatus.CONFIRMED,
        },
      });
    });

    this.logger.log(`Family memory ${familyMemoryId} confirmed by user ${userId}`);

    return { success: true };
  }

  /**
   * Reject a shared memory (mark as rejected).
   */
  async rejectMemory(userId: string, familyMemoryId: string) {
    const familyMemory = await this.prisma.familyMemory.findUnique({
      where: { id: familyMemoryId },
      include: { family: true },
    });

    if (!familyMemory) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '家庭记忆不存在',
      });
    }

    await this.ensureMembership(userId, familyMemory.familyId);

    if (familyMemory.contributorId === userId) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '不能拒绝自己分享的记忆',
      });
    }

    if (familyMemory.confirmationStatus === ConfirmationStatus.REJECTED) {
      return { success: true, message: '该记忆已被拒绝' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.familyMemory.update({
        where: { id: familyMemoryId },
        data: { confirmationStatus: ConfirmationStatus.REJECTED },
      });

      await tx.familyMemoryConfirmation.upsert({
        where: {
          familyMemoryId_confirmerId: {
            familyMemoryId,
            confirmerId: userId,
          },
        },
        update: { status: ConfirmationStatus.REJECTED },
        create: {
          familyMemoryId,
          confirmerId: userId,
          status: ConfirmationStatus.REJECTED,
        },
      });
    });

    this.logger.log(`Family memory ${familyMemoryId} rejected by user ${userId}`);

    return { success: true };
  }

  /**
   * List shared memories in a family with pagination and status filter.
   */
  async listSharedMemories(
    userId: string,
    familyId: string,
    query: QuerySharedMemoryDto,
  ): Promise<PaginatedResponse<unknown>> {
    await this.ensureMembership(userId, familyId);

    const { skip, take } = query;

    const where: Prisma.FamilyMemoryWhereInput = { familyId };
    if (query.status) {
      where.confirmationStatus = query.status;
    }

    const [familyMemories, total] = await Promise.all([
      this.prisma.familyMemory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          memory: {
            select: {
              id: true,
              title: true,
              content: true,
              type: true,
              emotion: true,
              occurredAt: true,
            },
          },
          confirmations: {
            select: {
              confirmerId: true,
              status: true,
              comment: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.familyMemory.count({ where }),
    ]);

    // Batch-fetch contributor profiles (no relation on FamilyMemory)
    const contributorIds = [...new Set(familyMemories.map((fm) => fm.contributorId))];
    const contributors = await this.prisma.user.findMany({
      where: { id: { in: contributorIds } },
      select: {
        id: true,
        profile: { select: { nickname: true, avatarUrl: true } },
      },
    });
    const contributorMap = new Map(contributors.map((c) => [c.id, c]));

    const items = familyMemories.map((fm) => ({
      ...fm,
      contributor: contributorMap.get(fm.contributorId) ?? null,
    }));

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

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Ensures the user is a member of the given family.
   * Throws ForbiddenException if not.
   */
  private async ensureMembership(userId: string, familyId: string): Promise<void> {
    const member = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: '您不是该家庭成员，无权访问',
      });
    }
  }

  /**
   * Generates a random 8-character alphanumeric invite code.
   */
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
