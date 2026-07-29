import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { QueryInterviewDto } from './dto/query-interview.dto';
import { ERROR_CODES, InterviewStatus, MessageSender } from '@echolife/shared';
import type { PaginatedResponse } from '@echolife/shared';

/** Allowed sortable fields for interview queries */
const ALLOWED_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'startedAt',
  'memoryCount',
  'title',
]);

/** Payload for adding a message to an interview */
export interface AddMessagePayload {
  sender: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================
  // Session Lifecycle
  // ============================================================

  /**
   * Create a new interview session for the user.
   */
  async createSession(userId: string, dto: CreateInterviewDto) {
    const interview = await this.prisma.interview.create({
      data: {
        userId,
        title: dto.title,
        status: InterviewStatus.ACTIVE,
      },
    });

    this.logger.log(`Interview session created: ${interview.id} for user: ${userId}`);

    return interview;
  }

  /**
   * Get a single interview session by ID, including its memory count.
   */
  async getSession(userId: string, id: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { messages: true, memories: true },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '访谈会话不存在',
      });
    }

    return interview;
  }

  /**
   * List interview sessions with pagination and optional status filter.
   */
  async listSessions(
    userId: string,
    query: QueryInterviewDto,
  ): Promise<PaginatedResponse<unknown>> {
    const { skip, take } = query;

    const where: Prisma.InterviewWhereInput = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const orderBy = this.buildOrderBy(query);

    const [items, total] = await Promise.all([
      this.prisma.interview.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          _count: {
            select: { messages: true, memories: true },
          },
        },
      }),
      this.prisma.interview.count({ where }),
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
   * Mark an interview session as completed and set the completedAt timestamp.
   */
  async completeSession(userId: string, id: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '访谈会话不存在',
      });
    }

    if (interview.status === InterviewStatus.COMPLETED) {
      throw new BadRequestException({
        code: ERROR_CODES.INTERVIEW_COMPLETED,
        message: '访谈会话已完成',
      });
    }

    // Recompute the accurate memory count from stored memories
    const memoryCount = await this.prisma.memory.count({
      where: { interviewId: id, isDeleted: false },
    });

    const updated = await this.prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.COMPLETED,
        completedAt: new Date(),
        memoryCount,
      },
    });

    this.logger.log(`Interview session completed: ${id}`);

    return updated;
  }

  /**
   * Mark an interview session as abandoned (soft delete via status).
   */
  async abandonSession(userId: string, id: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '访谈会话不存在',
      });
    }

    if (interview.status === InterviewStatus.ABANDONED) {
      return { success: true, message: '访谈会话已被放弃' };
    }

    const updated = await this.prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.ABANDONED,
        completedAt: new Date(),
      },
    });

    this.logger.log(`Interview session abandoned: ${id}`);

    return updated;
  }

  // ============================================================
  // Messages
  // ============================================================

  /**
   * Get all messages for an interview session, ordered by creation time.
   */
  async getMessages(userId: string, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, userId },
      select: { id: true },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '访谈会话不存在',
      });
    }

    return this.prisma.interviewMessage.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Add a message to an interview session and update the memory count
   * if the message was generated by the AI (memories may have been extracted).
   *
   * This is primarily an internal helper used by the AI orchestrator.
   */
  async addMessage(userId: string, interviewId: string, payload: AddMessagePayload) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, userId },
      select: { id: true, status: true },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: '访谈会话不存在',
      });
    }

    if (interview.status !== InterviewStatus.ACTIVE) {
      throw new BadRequestException({
        code: ERROR_CODES.INTERVIEW_COMPLETED,
        message: '访谈会话已结束，无法添加消息',
      });
    }

    const message = await this.prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: payload.sender,
        content: payload.content,
        metadata: (payload.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    return message;
  }

  /**
   * Synchronize the memoryCount field on the interview with the actual
   * number of non-deleted memories linked to this interview.
   */
  async syncMemoryCount(interviewId: string): Promise<number> {
    const memoryCount = await this.prisma.memory.count({
      where: { interviewId, isDeleted: false },
    });

    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { memoryCount },
    });

    return memoryCount;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Builds the Prisma orderBy clause from query parameters.
   * Falls back to createdAt descending for invalid sort fields.
   */
  private buildOrderBy(query: QueryInterviewDto): Prisma.InterviewOrderByWithRelationInput[] {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    if (!ALLOWED_SORT_FIELDS.has(sortBy)) {
      return [{ createdAt: 'desc' }];
    }

    return [{ [sortBy]: sortOrder }];
  }
}
