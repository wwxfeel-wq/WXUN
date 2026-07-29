import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ERROR_CODES } from '@echolife/shared';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get the current user's profile including subscription info.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: {
        profile: true,
        subscription: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            nickname: user.profile.nickname,
            avatarUrl: user.profile.avatarUrl,
            bio: user.profile.bio,
            birthDate: user.profile.birthDate,
            gender: user.profile.gender,
            location: user.profile.location,
            occupation: user.profile.occupation,
          }
        : null,
      roles,
      subscription: user.subscription
        ? {
            tier: user.subscription.tier,
            status: user.subscription.status,
            startedAt: user.subscription.startedAt,
            expiresAt: user.subscription.expiresAt,
          }
        : null,
    };
  }

  /**
   * Update the current user's profile.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Ensure the user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, profile: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // Build the update data, only including provided fields
    const updateData: Record<string, unknown> = {};
    if (dto.nickname !== undefined) updateData.nickname = dto.nickname;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.bio !== undefined) updateData.bio = dto.bio;
    if (dto.birthDate !== undefined) updateData.birthDate = dto.birthDate;
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.occupation !== undefined) updateData.occupation = dto.occupation;

    // Upsert the profile (create if it doesn't exist)
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        nickname: dto.nickname ?? '用户',
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        birthDate: dto.birthDate,
        gender: dto.gender,
        location: dto.location,
        occupation: dto.occupation,
      },
    });

    this.logger.log(`Profile updated for user: ${userId}`);

    return {
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      birthDate: profile.birthDate,
      gender: profile.gender,
      location: profile.location,
      occupation: profile.occupation,
    };
  }

  /**
   * Get the current user's settings.
   */
  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { settings: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (!user.settings) {
      // Settings should always exist (created during registration), but handle gracefully
      const settings = await this.prisma.userSettings.create({
        data: { userId },
      });
      return this.formatSettings(settings);
    }

    return this.formatSettings(user.settings);
  }

  /**
   * Update the current user's settings.
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // Build update data from provided fields
    const updateData: Record<string, unknown> = {};
    if (dto.theme !== undefined) updateData.theme = dto.theme;
    if (dto.language !== undefined) updateData.language = dto.language;
    if (dto.notificationEmail !== undefined) updateData.notificationEmail = dto.notificationEmail;
    if (dto.notificationPush !== undefined) updateData.notificationPush = dto.notificationPush;
    if (dto.aiTemperature !== undefined) updateData.aiTemperature = dto.aiTemperature;
    if (dto.memoryRetentionDays !== undefined) updateData.memoryRetentionDays = dto.memoryRetentionDays;

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        theme: dto.theme ?? 'dark',
        language: dto.language ?? 'zh-CN',
        notificationEmail: dto.notificationEmail ?? true,
        notificationPush: dto.notificationPush ?? true,
        aiTemperature: dto.aiTemperature ?? 0.7,
        memoryRetentionDays: dto.memoryRetentionDays ?? 365,
      },
    });

    this.logger.log(`Settings updated for user: ${userId}`);

    return this.formatSettings(settings);
  }

  /**
   * Get the current user's subscription details.
   */
  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { subscription: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (!user.subscription) {
      return {
        tier: 'free',
        status: 'active',
        startedAt: user.createdAt,
        expiresAt: null,
      };
    }

    return {
      tier: user.subscription.tier,
      status: user.subscription.status,
      startedAt: user.subscription.startedAt,
      expiresAt: user.subscription.expiresAt,
      cancelledAt: user.subscription.cancelledAt,
    };
  }

  /**
   * Soft-delete the user's account.
   * Sets status to 'deleted' and records the deletion timestamp.
   * Revokes all refresh tokens to force logout on all devices.
   */
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // Soft-delete the account
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
      },
    });

    // Revoke all refresh tokens
    await this.redis.revokeAllRefreshTokens(userId);

    // Clear working memory
    await this.redis.clearWorkingMemory(userId);

    this.logger.log(`Account deleted: ${user.email}`);
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private formatSettings(settings: {
    theme: string;
    language: string;
    notificationEmail: boolean;
    notificationPush: boolean;
    aiTemperature: number;
    memoryRetentionDays: number;
    updatedAt: Date;
  }) {
    return {
      theme: settings.theme,
      language: settings.language,
      notificationEmail: settings.notificationEmail,
      notificationPush: settings.notificationPush,
      aiTemperature: settings.aiTemperature,
      memoryRetentionDays: settings.memoryRetentionDays,
      updatedAt: settings.updatedAt,
    };
  }
}
