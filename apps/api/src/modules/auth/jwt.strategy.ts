import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JWT_CONFIG } from '@echolife/shared';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  subscriptionTier: string;
  type: 'access' | 'refresh';
  tokenId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
    });
  }

  /**
   * Validates the JWT payload against the database.
   * Loads the user's roles via the userRoles relation and includes the subscription tier.
   * The returned object is attached to request.user by Passport.
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    // Only access tokens are accepted for authentication
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        subscription: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException(`Account is ${user.status}`);
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Account has been deleted');
    }

    // Load role names from the userRoles relation
    const roles = user.userRoles.map((ur) => ur.role.name);

    // Determine subscription tier from the subscription relation
    const subscriptionTier = user.subscription?.tier ?? 'free';

    return {
      userId: user.id,
      email: user.email,
      roles,
      subscriptionTier,
    };
  }
}
