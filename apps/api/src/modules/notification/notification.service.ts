import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { ERROR_CODES, REDIS_KEYS } from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** Payload for creating a notification (internal use) */
export interface CreateNotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // Notification Queries
  // ============================================================

  /**
   * List notifications for the current user with pagination and
   * optional read/unread filter.
   */
  async list(
    userId: string,
    query: QueryNotificationDto,
  ): Promise<PaginatedResponse<unknown> & { unreadCount: number }> {
    const { skip, take } = query;

    const where: Prisma.NotificationWhereInput = { userId };
    if (query.read !== undefined) {
      where.read = query.read === 'true';
    }
    if (query.type) {
      where.type = query.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, read: false },
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
      unreadCount,
    };
  }

  // ============================================================
  // Notification Actions
  // ============================================================

  /**
   * Mark a single notification as read.
   */
  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, read: true },
    });

    if (!notification) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '通知不存在',
      });
    }

    if (notification.read) {
      return { success: true, message: '通知已标记为已读' };
    }

    await this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return { success: true };
  }

  /**
   * Mark all unread notifications for the user as read.
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    this.logger.log(`Marked ${result.count} notifications as read for user: ${userId}`);

    return {
      success: true,
      count: result.count,
    };
  }

  /**
   * Delete a notification permanently.
   */
  async delete(userId: string, id: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '通知不存在',
      });
    }

    await this.prisma.notification.delete({
      where: { id },
    });
  }

  // ============================================================
  // Internal Notification Creation
  // ============================================================

  /**
   * Create a notification for a user. This is primarily used
   * internally by other services (e.g., capsule opening reminders,
   * family memory confirmations, summary ready notifications).
   */
  async create(payload: CreateNotificationPayload) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: (payload.data ?? undefined) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Notification created for user ${payload.userId}: ${payload.title}`);

    return notification;
  }

  /**
   * Create notifications for multiple users in batch.
   * Useful for system-wide announcements.
   */
  async createBatch(payloads: CreateNotificationPayload[]) {
    if (payloads.length === 0) return [];

    const result = await this.prisma.$transaction(
      payloads.map((payload) =>
        this.prisma.notification.create({
          data: {
            userId: payload.userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            data: (payload.data ?? undefined) as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    this.logger.log(`Batch created ${result.length} notifications`);

    return result;
  }
}
