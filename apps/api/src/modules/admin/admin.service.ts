import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PromptService } from '../ai/services/prompt.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryAiLogsDto } from './dto/query-ai-logs.dto';
import { QueryPromptsDto } from './dto/query-prompts.dto';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { UpdatePromptStatusDto } from './dto/update-prompt-status.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import {
  ERROR_CODES,
  PromptStatus,
  UserStatus,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly promptService: PromptService,
  ) {}

  // ============================================================
  // User Management
  // ============================================================

  /**
   * List all users with pagination, optional status filter, and email search.
   */
  async listUsers(query: QueryUsersDto): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.UserWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.email = { contains: query.search.trim(), mode: 'insensitive' };
    }
    // Exclude soft-deleted users by default
    where.deletedAt = null;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          status: true,
          emailVerified: true,
          phoneVerified: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          profile: {
            select: { nickname: true, avatarUrl: true },
          },
          subscription: {
            select: { tier: true, status: true, expiresAt: true },
          },
          userRoles: {
            include: { role: { select: { name: true } } },
          },
          _count: {
            select: { memories: true, interviews: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // Format the results
    const formattedItems = items.map((user) => ({
      ...user,
      roles: user.userRoles.map((ur) => ur.role.name),
      userRoles: undefined,
    }));

    return {
      items: formattedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Update a user's account status (suspend/activate).
   */
  async updateUserStatus(userId: string, dto: UpdateUserStatusDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (user.status === dto.status) {
      return { success: true, message: `用户状态已是 ${dto.status}` };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status },
    });

    // If suspended, revoke all refresh tokens to force logout
    if (dto.status === UserStatus.SUSPENDED) {
      await this.redis.revokeAllRefreshTokens(userId);
    }

    // Log the action
    await this.logAuditAction({
      userId,
      actionBy: adminId,
      action: `update_status`,
      resource: 'users',
      resourceId: userId,
      details: { from: user.status, to: dto.status },
    });

    this.logger.log(`User ${userId} status updated to ${dto.status} by admin ${adminId}`);

    return {
      success: true,
      userId,
      status: dto.status,
    };
  }

  // ============================================================
  // AI Call Logs
  // ============================================================

  /**
   * List AI call logs with filtering by agent type, status, user, and date range.
   */
  async listAiLogs(query: QueryAiLogsDto): Promise<PaginatedResponse<unknown> & { stats: Record<string, unknown> }> {
    const { skip, take } = query;

    const where: Prisma.AICallLogWhereInput = {};
    if (query.agentType) {
      where.agentType = query.agentType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    const [items, total, stats] = await Promise.all([
      this.prisma.aICallLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { nickname: true } },
            },
          },
        },
      }),
      this.prisma.aICallLog.count({ where }),
      this.prisma.aICallLog.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
        _avg: {
          latencyMs: true,
        },
        _count: true,
      }),
    ]);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats: {
        totalCount: stats._count,
        totalTokens: stats._sum.totalTokens ?? 0,
        promptTokens: stats._sum.promptTokens ?? 0,
        completionTokens: stats._sum.completionTokens ?? 0,
        averageLatencyMs: stats._avg.latencyMs ?? 0,
      },
    };
  }

  // ============================================================
  // Prompt Version Management
  // ============================================================

  /**
   * List prompt versions with optional agent type and status filter.
   */
  async listPrompts(query: QueryPromptsDto): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.PromptVersionWhereInput = {};
    if (query.agentType) {
      where.agentType = query.agentType;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.promptVersion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.promptVersion.count({ where }),
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
   * Create a new prompt version.
   */
  async createPrompt(dto: CreatePromptDto, adminId: string) {
    // Check for existing version with the same agentType + version
    const existing = await this.prisma.promptVersion.findUnique({
      where: {
        agentType_version: {
          agentType: dto.agentType,
          version: dto.version,
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: `代理 ${dto.agentType} 的版本 ${dto.version} 已存在`,
      });
    }

    const prompt = await this.prisma.promptVersion.create({
      data: {
        agentType: dto.agentType,
        version: dto.version,
        status: PromptStatus.DRAFT,
        content: dto.content,
        variables: (dto.variables ?? undefined) as Prisma.InputJsonValue,
        description: dto.description ?? null,
        createdBy: adminId,
      },
    });

    // Log the action
    await this.logAuditAction({
      actionBy: adminId,
      action: 'create_prompt',
      resource: 'prompts',
      resourceId: prompt.id,
      details: { agentType: dto.agentType, version: dto.version },
    });

    this.logger.log(`Prompt version created: ${dto.agentType}@${dto.version} by admin ${adminId}`);

    return prompt;
  }

  /**
   * Update a prompt version's status (activate or archive).
   * When activating a prompt, all other versions of the same agent type
   * are archived to ensure only one active version exists.
   */
  async updatePromptStatus(
    promptId: string,
    dto: UpdatePromptStatusDto,
    adminId: string,
  ) {
    const prompt = await this.prisma.promptVersion.findUnique({
      where: { id: promptId },
    });

    if (!prompt) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '提示词版本不存在',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.status === PromptStatus.ACTIVE) {
        // Archive all other active versions of the same agent type
        await tx.promptVersion.updateMany({
          where: {
            agentType: prompt.agentType,
            status: PromptStatus.ACTIVE,
            id: { not: promptId },
          },
          data: {
            status: PromptStatus.ARCHIVED,
            archivedAt: new Date(),
          },
        });
      }

      // Update the target prompt
      await tx.promptVersion.update({
        where: { id: promptId },
        data: {
          status: dto.status,
          ...(dto.status === PromptStatus.ARCHIVED && { archivedAt: new Date() }),
        },
      });
    });

    // Invalidate the prompt cache for this agent type
    await this.promptService.invalidateCache(prompt.agentType);

    // Log the action
    await this.logAuditAction({
      actionBy: adminId,
      action: 'update_prompt_status',
      resource: 'prompts',
      resourceId: promptId,
      details: { from: prompt.status, to: dto.status, agentType: prompt.agentType },
    });

    this.logger.log(`Prompt ${promptId} status updated to ${dto.status} by admin ${adminId}`);

    return { success: true, promptId, status: dto.status };
  }

  // ============================================================
  // Announcement Management
  // ============================================================

  /**
   * List all announcements with pagination.
   */
  async listAnnouncements(page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<unknown>> {
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.announcement.count(),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Create a new announcement.
   */
  async createAnnouncement(dto: CreateAnnouncementDto, adminId: string) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        type: dto.type ?? 'info',
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        expiresAt: dto.expiresAt ?? null,
      },
    });

    // Log the action
    await this.logAuditAction({
      actionBy: adminId,
      action: 'create_announcement',
      resource: 'announcements',
      resourceId: announcement.id,
      details: { title: dto.title },
    });

    this.logger.log(`Announcement created: ${announcement.id} by admin ${adminId}`);

    return announcement;
  }

  /**
   * Update an existing announcement.
   */
  async updateAnnouncement(id: string, dto: UpdateAnnouncementDto, adminId: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '公告不存在',
      });
    }

    const data: Prisma.AnnouncementUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt;

    // Handle publish state changes
    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
      if (dto.isPublished && !existing.isPublished) {
        // Publishing for the first time
        data.publishedAt = new Date();
      } else if (!dto.isPublished) {
        // Unpublishing
        data.publishedAt = null;
      }
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data,
    });

    // Log the action
    await this.logAuditAction({
      actionBy: adminId,
      action: 'update_announcement',
      resource: 'announcements',
      resourceId: id,
      details: dto as Record<string, unknown>,
    });

    this.logger.log(`Announcement ${id} updated by admin ${adminId}`);

    return updated;
  }

  // ============================================================
  // System Configuration
  // ============================================================

  /**
   * List all system configurations.
   */
  async listSystemConfigs() {
    return this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /**
   * Update or create a system configuration by key.
   */
  async updateSystemConfig(dto: UpdateSystemConfigDto, adminId: string) {
    const key = dto.key!;
    const config = await this.prisma.systemConfig.upsert({
      where: { key },
      update: {
        value: dto.value,
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      create: {
        key,
        value: dto.value,
        type: dto.type ?? 'string',
        description: dto.description ?? null,
      },
    });

    // Log the action
    await this.logAuditAction({
      actionBy: adminId,
      action: 'update_system_config',
      resource: 'system_configs',
      resourceId: key,
      details: { key, value: dto.value },
    });

    this.logger.log(`System config ${key} updated by admin ${adminId}`);

    return config;
  }

  // ============================================================
  // Audit Logs
  // ============================================================

  /**
   * List audit logs with filtering by action, resource, user, and date range.
   */
  async listAuditLogs(query: QueryAuditLogsDto): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }
    if (query.resource) {
      where.resource = { contains: query.resource, mode: 'insensitive' };
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { nickname: true } },
            },
          },
          actionByUser: {
            select: {
              id: true,
              email: true,
              profile: { select: { nickname: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
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

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Logs an audit action to the AuditLog table.
   */
  private async logAuditAction(params: {
    userId?: string;
    actionBy: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId ?? null,
          actionBy: params.actionBy,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId ?? null,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          details: (params.details ?? undefined) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log audit action: ${(error as Error).message}`);
    }
  }
}
