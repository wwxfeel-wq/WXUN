import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateCapsuleDto } from './dto/create-capsule.dto';
import {
  ERROR_CODES,
  CapsuleStatus,
  CapsuleType,
} from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** Query parameters for listing capsules */
export interface CapsuleQuery {
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CapsuleService {
  private readonly logger = new Logger(CapsuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // CRUD Operations
  // ============================================================

  /**
   * Create a new time capsule sealed until the specified openAt date.
   */
  async create(userId: string, dto: CreateCapsuleDto) {
    // Validate the openAt is in the future
    if (dto.openAt <= new Date()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '开启时间必须晚于当前时间',
      });
    }

    const capsule = await this.prisma.timeCapsule.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        type: dto.type ?? CapsuleType.PERSONAL,
        status: CapsuleStatus.SEALED,
        openAt: dto.openAt,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Time capsule created: ${capsule.id} for user: ${userId}, opens at: ${dto.openAt.toISOString()}`);

    return capsule;
  }

  /**
   * Get a single capsule by ID. Sealed capsules return content as a
   * placeholder message to prevent premature reading.
   */
  async get(userId: string, id: string) {
    const capsule = await this.prisma.timeCapsule.findFirst({
      where: { id, userId },
    });

    if (!capsule) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '时间胶囊不存在',
      });
    }

    // If the capsule is sealed and not yet openable, hide the content
    if (capsule.status === CapsuleStatus.SEALED && capsule.openAt > new Date()) {
      return {
        ...capsule,
        content: '【此时间胶囊尚未到开启时间，内容已封存】',
        canOpen: false,
        remainingDays: Math.ceil(
          (capsule.openAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      };
    }

    return {
      ...capsule,
      canOpen: true,
    };
  }

  /**
   * List capsules with optional status filter and pagination.
   */
  async list(userId: string, query: CapsuleQuery): Promise<PaginatedResponse<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: Prisma.TimeCapsuleWhereInput = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.timeCapsule.findMany({
        where,
        orderBy: { openAt: 'asc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          sealedAt: true,
          openAt: true,
          openedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.timeCapsule.count({ where }),
    ]);

    // Add canOpen and remainingDays computed fields
    const now = new Date();
    const enrichedItems = items.map((item) => ({
      ...item,
      canOpen: item.status === CapsuleStatus.SEALED && item.openAt <= now,
      remainingDays:
        item.status === CapsuleStatus.SEALED
          ? Math.max(0, Math.ceil((item.openAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0,
    }));

    return {
      items: enrichedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Open a sealed time capsule. Only succeeds if the current date is
   * on or after the openAt date. Marks the capsule as opened.
   */
  async open(userId: string, id: string) {
    const capsule = await this.prisma.timeCapsule.findFirst({
      where: { id, userId },
    });

    if (!capsule) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '时间胶囊不存在',
      });
    }

    if (capsule.status === CapsuleStatus.OPENED) {
      throw new BadRequestException({
        code: ERROR_CODES.CAPSULE_SEALED,
        message: '时间胶囊已被打开',
      });
    }

    // Check if the capsule can be opened
    if (capsule.openAt > new Date()) {
      const remainingDays = Math.ceil(
        (capsule.openAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      throw new BadRequestException({
        code: ERROR_CODES.CAPSULE_SEALED,
        message: `时间胶囊尚未到开启时间，还需等待 ${remainingDays} 天`,
      });
    }

    const opened = await this.prisma.timeCapsule.update({
      where: { id },
      data: {
        status: CapsuleStatus.OPENED,
        openedAt: new Date(),
      },
    });

    this.logger.log(`Time capsule opened: ${id} by user: ${userId}`);

    return opened;
  }

  /**
   * Delete a time capsule permanently.
   */
  async delete(userId: string, id: string): Promise<void> {
    const capsule = await this.prisma.timeCapsule.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!capsule) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '时间胶囊不存在',
      });
    }

    await this.prisma.timeCapsule.delete({
      where: { id },
    });

    this.logger.log(`Time capsule deleted: ${id} by user: ${userId}`);
  }
}
