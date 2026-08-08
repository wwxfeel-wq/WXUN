import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * H-038: 自定义 401 响应，确保返回结构化 JSON 而非默认的纯文本。
   *
   * 当 JWT 验证失败时（缺失、过期、无效），抛出包含统一错误码的
   * UnauthorizedException，由 HttpExceptionFilter 统一格式化为 JSON 响应。
   */
  handleRequest<T = unknown>(
    err: unknown,
    user: T | undefined,
    _info: unknown,
  ): T {
    if (err || !user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 40100,
        message: err instanceof Error ? err.message : '登录已过期或未登录，请重新登录',
        timestamp: new Date().toISOString(),
      });
    }
    return user;
  }
}
