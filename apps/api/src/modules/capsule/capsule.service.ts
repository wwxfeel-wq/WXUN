import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { LlmAdapterService, ChatMessage } from '../ai/services/llm-adapter.service';
import { CreateCapsuleDto } from './dto/create-capsule.dto';
import {
  ERROR_CODES,
  CapsuleStatus,
  CapsuleType,
  SHIMO_PERSONA,
  KindnessLevel,
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
    private readonly llmAdapter: LlmAdapterService,
  ) {}

  // ============================================================
  // CRUD Operations
  // ============================================================

  /**
   * Create a new time capsule sealed until the specified openAt date.
   *
   * 童忆引擎扩展：支持媒体附件（照片、语音、文字）和温暖等级，
   * 存储在 metadata 中，开启时由 AI 重新讲述。
   */
  async create(userId: string, dto: CreateCapsuleDto) {
    // Validate the openAt is in the future
    const openAtDate = new Date(dto.openAt);
    if (openAtDate <= new Date()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_PARAMS,
        message: '开启时间必须晚于当前时间',
      });
    }

    // 将媒体附件和温暖等级合并到 metadata
    const metadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
    };
    if (dto.media && dto.media.length > 0) {
      metadata.media = dto.media;
    }
    if (dto.kindnessLevel) {
      metadata.kindnessLevel = dto.kindnessLevel;
    }

    const capsule = await this.prisma.timeCapsule.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        type: dto.type ?? CapsuleType.PERSONAL,
        status: CapsuleStatus.SEALED,
        openAt: dto.openAt,
        metadata: Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    this.logger.log(`Time capsule created: ${capsule.id} for user: ${userId}, opens at: ${openAtDate.toISOString()}`);

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
   *
   * 童忆引擎扩展：开启时由时墨 AI 重新讲述胶囊内容，
   * 像多年后重新看到小时候电视里的那种温暖感觉。
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

    // 异步生成 AI 温暖重述
    const aiNarrative = await this.generateAiNarrative(capsule).catch((err) => {
      this.logger.warn(`AI narrative generation failed for capsule ${id}: ${(err as Error).message}`);
      return null;
    });

    return { ...opened, aiNarrative };
  }

  /**
   * 童忆引擎：AI 重新讲述时间胶囊 — 像公益广告结尾的旁白
   */
  private async generateAiNarrative(capsule: {
    id: string;
    title: string;
    content: string;
    type: string;
    sealedAt: Date;
    openAt: Date;
    metadata?: Prisma.JsonValue;
  }): Promise<string | null> {
    // 从 metadata 提取媒体和温暖等级
    const metadata = (capsule.metadata ?? {}) as Record<string, unknown>;
    const media = Array.isArray(metadata.media) ? metadata.media : [];
    const kindnessLevel = (metadata.kindnessLevel as string) ?? KindnessLevel.WARM;

    // 计算封存天数
    const sealedDays = Math.floor(
      (Date.now() - capsule.sealedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const mediaDesc = media.length > 0
      ? `\n附件：${media.map((m: { type?: string; description?: string }) => `${m.type}(${m.description ?? '无描述'})`).join('、')}`
      : '';

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR}，${SHIMO_PERSONA.ROLE}。
用户刚刚打开了一个封存了 ${sealedDays} 天的时间胶囊。请像小时候电视里的公益广告结尾旁白一样，重新讲述这段记忆。

风格要求：
- 短、温暖、有画面感，像公益广告的最后几十秒
- 3-5 句话
- 不要复述原文，而是重新讲述，带一点时间的距离感
- 最后一句轻轻点题
- 用中文`,
      },
      {
        role: 'user',
        content: `时间胶囊标题：${capsule.title}
封存时间：${capsule.sealedAt.toLocaleDateString('zh-CN')}
开启时间：${new Date().toLocaleDateString('zh-CN')}
封存天数：${sealedDays} 天
温暖等级：${kindnessLevel}

内容：
${capsule.content}${mediaDesc}

请重新讲述这段记忆。`,
      },
    ];

    try {
      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.85,
        maxTokens: 300,
      });

      this.logger.log(`AI narrative generated for capsule: ${capsule.id}`);
      return result.content;
    } catch (error) {
      this.logger.warn(`AI narrative failed: ${(error as Error).message}`);
      return null;
    }
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
