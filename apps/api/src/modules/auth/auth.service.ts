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
    // Check for existing email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
        message: '该邮箱已被注册',
      });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user, profile, settings, subscription in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        profile: true,
        subscription: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
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
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '邮箱或密码不正确',
      });
    }

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

    // Validate the refresh token exists in Redis
    const isValid = await this.redis.validateRefreshToken(payload.sub, payload.tokenId);
    if (!isValid) {
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

    // Revoke old refresh token (rotation)
    await this.redis.revokeRefreshToken(payload.sub, payload.tokenId);

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
      // Decode the refresh token to get the tokenId and revoke it
      try {
        const payload = this.jwtService.decode(refreshToken) as JwtPayload | null;
        if (payload && payload.sub === userId && payload.tokenId) {
          await this.redis.revokeRefreshToken(userId, payload.tokenId);
        }
      } catch {
        // If decoding fails, revoke all tokens as a safety measure
        await this.redis.revokeAllRefreshTokens(userId);
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
    const userId = await this.redis.get(key);

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
      // Already verified, clean up the token
      await this.redis.del(key);
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    await this.redis.del(key);
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
   * Returns the token (in production this would be sent via email).
   */
  async requestPasswordReset(email: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    // For security, don't reveal whether the email exists
    if (!user || user.status !== 'active') {
      // Return a dummy token to prevent email enumeration
      return this.encryption.generateToken(32);
    }

    const resetToken = this.encryption.generateToken(32);
    await this.redis.set(
      `${REDIS_KEYS.OTP}password_reset:${resetToken}`,
      user.id,
      REDIS_TTL.OTP,
    );

    this.logger.log(`Password reset requested for: ${email}`);
    return resetToken;
  }

  async resetPassword(email: string, resetToken: string, newPassword: string): Promise<void> {
    const key = `${REDIS_KEYS.OTP}password_reset:${resetToken}`;
    const userId = await this.redis.get(key);

    if (!userId) {
      throw new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '重置令牌无效或已过期',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user || user.email !== email) {
      throw new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '重置令牌与邮箱不匹配',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate the reset token
    await this.redis.del(key);

    // Revoke all refresh tokens (force re-login on all devices)
    await this.redis.revokeAllRefreshTokens(userId);

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
    const tokenId = nanoid();

    const accessPayload: JwtPayload = {
      sub: payload.userId,
      email: payload.email,
      roles: payload.roles,
      subscriptionTier: payload.subscriptionTier,
      type: 'access',
      tokenId,
    };

    const refreshPayload: JwtPayload = {
      sub: payload.userId,
      email: payload.email,
      roles: payload.roles,
      subscriptionTier: payload.subscriptionTier,
      type: 'refresh',
      tokenId,
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

    // Store refresh token in Redis: refresh_token:{userId}:{tokenId}
    await this.redis.storeRefreshToken(payload.userId, tokenId, this.refreshTtlSeconds);

    return { accessToken, refreshToken };
  }

  private buildUserResponse(
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      status: string;
      profile: { nickname: string; avatarUrl: string | null; bio: string | null } | null;
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
