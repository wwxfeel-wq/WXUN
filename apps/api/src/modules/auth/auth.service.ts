import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './jwt.strategy';
import {
  JWT_CONFIG,
  REDIS_KEYS,
  REDIS_TTL,
  SubscriptionTier,
  RoleName,
  ERROR_CODES,
} from '@echolife/shared';

/** Shape of the user object returned in auth responses */
export interface AuthUserResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  profile: {
    nickname: string;
    avatarUrl: string | null;
    bio: string | null;
    birthDate: string | null;
    gender: string | null;
    location: string | null;
    occupation: string | null;
  };
  roles: string[];
  subscription: {
    tier: string;
    status: string;
    expiresAt: string | null;
  };
}

/** Shape of the token response */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserResponse;
}

/** Extended payload that includes tokenId for internal use */
interface FullUserPayload {
  userId: string;
  email: string;
  roles: string[];
  subscriptionTier: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlSeconds = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionUtil,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ============================================================
  // Registration
  // ============================================================

  async register(dto: RegisterDto): Promise<AuthResponse> {
    // R3-BUG-019: Normalize email to lowercase
    const normalizedEmail = dto.email.toLowerCase();

    // Check for existing email
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
        message: '该邮箱已被注册',
      });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user, profile, settings, subscription in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          status: 'active',
          emailVerified: false,
          profile: {
            create: {
              nickname: dto.nickname,
            },
          },
          settings: {
            create: {},
          },
          subscription: {
            create: {
              tier: SubscriptionTier.FREE,
              status: 'active',
            },
          },
        },
        include: {
          profile: true,
          subscription: true,
        },
      });

      // Assign the default 'user' role
      const userRole = await tx.role.upsert({
        where: { name: RoleName.USER },
        update: {},
        create: {
          name: RoleName.USER,
          description: 'Standard user role',
        },
      });

      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleId: userRole.id,
        },
      });

      return newUser;
    });

    // Generate verification token and store in Redis
    const verifyToken = this.encryption.generateToken(32);
    await this.redis.set(
      `${REDIS_KEYS.OTP}email_verify:${verifyToken}`,
      user.id,
      REDIS_TTL.LONG_CACHE,
    );

    // Generate tokens
    const payload: FullUserPayload = {
      userId: user.id,
      email: user.email,
      roles: [RoleName.USER],
      subscriptionTier: SubscriptionTier.FREE,
    };

    const tokens = await this.generateTokens(payload);

    this.logger.log(`User registered: ${user.email}`);

    return {
      ...tokens,
      user: this.buildUserResponse(user, [RoleName.USER], user.subscription!),
    };
  }

  // ============================================================
  // Login
  // ============================================================

  async login(dto: LoginDto): Promise<AuthResponse> {
    // R3-BUG-019: Normalize email to lowercase
    const normalizedEmail = dto.email.toLowerCase();
    const lockedKey = `auth:locked:${normalizedEmail}`;
    if (await this.redis.exists(lockedKey)) {
      // R3-BUG-014: Extend lock TTL on continued login attempts to prevent brute force
      await this.redis.set(lockedKey, '1', 900);
      throw new UnauthorizedException({
        code: ERROR_CODES.ACCOUNT_SUSPENDED,
        message: '账户已被锁定，请15分钟后再试',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        profile: true,
        subscription: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      // 执行 dummy bcrypt 比较以防止时序攻击泄露用户是否存在
      await bcrypt.compare(dto.password, '$2a$10$N9qo8uLOickgx2ZMRZoMy.MQDqoX7B9r8V7vOqOBF1xJrR2eJ9kK');
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '邮箱或密码不正确',
      });
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException({
        code: ERROR_CODES.ACCOUNT_SUSPENDED,
        message: `账户状态异常: ${user.status}`,
      });
    }

    if (user.deletedAt) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '账户已被删除',
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      const failedKey = `auth:failed:${normalizedEmail}`;
      const attempts = await this.redis.getClient.incr(failedKey);
      if (attempts === 1) {
        await this.redis.getClient.expire(failedKey, 900);
      }
      if (attempts >= 5) {
        await this.redis.set(lockedKey, '1', 900);
      }
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '邮箱或密码不正确',
      });
    }

    await this.redis.del(`auth:failed:${normalizedEmail}`);

    const roles = user.userRoles.map((ur) => ur.role.name);
    const subscriptionTier = user.subscription?.tier ?? SubscriptionTier.FREE;

    const payload: FullUserPayload = {
      userId: user.id,
      email: user.email,
      roles,
      subscriptionTier,
    };

    const tokens = await this.generateTokens(payload);

    // Update last login time
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      ...tokens,
      user: this.buildUserResponse(user, roles, user.subscription!),
    };
  }

  // ============================================================
  // Refresh Token
  // ============================================================

  async refreshToken(dto: RefreshTokenDto): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        issuer: JWT_CONFIG.ISSUER,
        audience: JWT_CONFIG.AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.REFRESH_TOKEN_EXPIRED,
        message: '刷新令牌无效或已过期',
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '令牌类型不正确',
      });
    }

    // Atomically validate and revoke the refresh token (GETDEL)
    const tokenKey = `${REDIS_KEYS.REFRESH_TOKEN}${payload.sub}:${payload.tokenId}`;
    const storedValue = await this.redis.getDel(tokenKey);
    if (!storedValue) {
      throw new UnauthorizedException({
        code: ERROR_CODES.REFRESH_TOKEN_EXPIRED,
        message: '刷新令牌已被撤销',
      });
    }

    // Load fresh user data
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        subscription: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || user.status !== 'active' || user.deletedAt) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '用户不可用',
      });
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const subscriptionTier = user.subscription?.tier ?? SubscriptionTier.FREE;

    // Generate new tokens
    const newPayload: FullUserPayload = {
      userId: user.id,
      email: user.email,
      roles,
      subscriptionTier,
    };

    const tokens = await this.generateTokens(newPayload);

    return {
      ...tokens,
      user: this.buildUserResponse(user, roles, user.subscription!),
    };
  }

  // ============================================================
  // Logout
  // ============================================================

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // R1-BE-012: 使用 verify 替代 decode，验证 JWT 签名
      try {
        const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          issuer: JWT_CONFIG.ISSUER,
          audience: JWT_CONFIG.AUDIENCE,
        });
        if (payload && payload.sub === userId && payload.tokenId) {
          await this.redis.revokeRefreshToken(userId, payload.tokenId);
        }
      } catch {
        // verify 失败（签名无效/过期）则忽略，不撤销令牌
      }
    } else {
      // No specific token provided, revoke all refresh tokens
      await this.redis.revokeAllRefreshTokens(userId);
    }

    this.logger.log(`User logged out: ${userId}`);
  }

  // ============================================================
  // Email Verification
  // ============================================================

  async verifyEmail(token: string): Promise<void> {
    const key = `${REDIS_KEYS.OTP}email_verify:${token}`;
    // R3-BUG-004: Use getDel for atomic get+delete to prevent TOCTOU race
    const userId = await this.redis.getDel(key);

    if (!userId) {
      throw new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '验证令牌无效或已过期',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (user.emailVerified) {
      // Already verified, token already consumed via getDel
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    this.logger.log(`Email verified for user: ${userId}`);
  }

  /**
   * Generate a new email verification token for a user.
   * Returns the token to be sent via email.
   */
  async requestEmailVerification(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: '用户不存在',
      });
    }

    if (user.emailVerified) {
      throw new BadRequestException('邮箱已验证');
    }

    const token = this.encryption.generateToken(32);
    await this.redis.set(
      `${REDIS_KEYS.OTP}email_verify:${token}`,
      userId,
      REDIS_TTL.LONG_CACHE,
    );

    return token;
  }

  // ============================================================
  // Password Reset
  // ============================================================

  /**
   * Request a password reset. Generates a reset token and stores it in Redis.
   * Does not reveal whether the email exists — always returns the same message.
   *
   * H-005 / R1-BE-005: The reset token is NEVER returned in the API response
   * and is NEVER logged. The token is only stored in Redis for later
   * verification. In production, the token should be delivered via a secure
   * email link.
   * TODO: Integrate an email service to send the reset link in production.
   */
  async requestPasswordReset(
    email: string,
  ): Promise<{ success: true; message: string }> {
    // R3-BUG-019: Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, status: true },
    });

    // For security, don't reveal whether the email exists
    if (user && user.status === 'active') {
      const resetToken = this.encryption.generateToken(32);
      await this.redis.set(
        `${REDIS_KEYS.OTP}password_reset:${resetToken}`,
        user.id,
        REDIS_TTL.OTP,
      );
      // R1-BE-005: 移除 token 日志记录，仅记录邮箱
      this.logger.log(`Password reset requested for: ${normalizedEmail}`);
    }

    // 始终返回相同的消息，不泄露邮箱是否已注册
    return { success: true, message: '如果该邮箱已注册，重置链接已发送' };
  }

  async resetPassword(email: string, resetToken: string, newPassword: string): Promise<void> {
    // R3-BUG-019: Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    const key = `${REDIS_KEYS.OTP}password_reset:${resetToken}`;
    // R3-BUG-003: Use getDel for atomic get+delete to prevent TOCTOU race
    const userId = await this.redis.getDel(key);

    if (!userId) {
      throw new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '重置令牌无效或已过期',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (!user || user.email !== normalizedEmail) {
        throw new BadRequestException({
          code: ERROR_CODES.TOKEN_INVALID,
          message: '重置令牌与邮箱不匹配',
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    });

    // Token already consumed via getDel; revoke all refresh tokens (force re-login on all devices)
    try {
      await this.redis.revokeAllRefreshTokens(userId);
    } catch (e) {
      this.logger.error(
        `Failed to revoke refresh tokens after password reset: ${(e as Error).message}`,
      );
    }

    this.logger.log(`Password reset for user: ${userId}`);
  }

  // ============================================================
  // Get Current User
  // ============================================================

  async getCurrentUser(userId: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    return this.buildUserResponse(user, roles, user.subscription!);
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private async generateTokens(payload: FullUserPayload): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    // L-001: Generate separate tokenIds for access and refresh tokens
    // so that revoking one does not affect the other.
    const accessTokenId = nanoid();
    const refreshTokenId = nanoid();

    const accessPayload: JwtPayload = {
      sub: payload.userId,
      email: payload.email,
      roles: payload.roles,
      subscriptionTier: payload.subscriptionTier,
      type: 'access',
      tokenId: accessTokenId,
    };

    const refreshPayload: JwtPayload = {
      sub: payload.userId,
      email: payload.email,
      roles: payload.roles,
      subscriptionTier: payload.subscriptionTier,
      type: 'refresh',
      tokenId: refreshTokenId,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_IN,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: JWT_CONFIG.REFRESH_TOKEN_EXPIRES_IN,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
    });

    // Store refresh token in Redis with its own unique tokenId
    await this.redis.storeRefreshToken(payload.userId, refreshTokenId, this.refreshTtlSeconds);

    return { accessToken, refreshToken };
  }

  private buildUserResponse(
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      status: string;
      profile: {
        nickname: string;
        avatarUrl: string | null;
        bio: string | null;
        birthDate: Date | null;
        gender: string | null;
        location: string | null;
        occupation: string | null;
      } | null;
      subscription: { tier: string; status: string; expiresAt: Date | null } | null;
    },
    roles: string[],
    subscription: { tier: string; status: string; expiresAt: Date | null },
  ): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      profile: {
        nickname: user.profile?.nickname ?? '',
        avatarUrl: user.profile?.avatarUrl ?? null,
        bio: user.profile?.bio ?? null,
        birthDate: user.profile?.birthDate ? user.profile.birthDate.toISOString() : null,
        gender: user.profile?.gender ?? null,
        location: user.profile?.location ?? null,
        occupation: user.profile?.occupation ?? null,
      },
      roles,
      subscription: {
        tier: subscription?.tier ?? SubscriptionTier.FREE,
        status: subscription?.status ?? 'active',
        expiresAt: subscription?.expiresAt ? subscription.expiresAt.toISOString() : null,
      },
    };
  }
}
