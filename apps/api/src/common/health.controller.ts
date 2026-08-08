import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from './decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('系统')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  async check(@Res() response: Response) {
    const checks: Record<string, string> = {};

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Check Redis
    try {
      const pong = await this.redis.getClient?.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    // Check AI service configuration (does not call the AI service)
    const aiKeys = [
      'GLM_API_KEY',
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
      'QWEN_API_KEY',
    ];
    const hasAiKey = aiKeys.some(
      (k) => this.configService.get<string>(k)?.trim(),
    );
    checks.aiService = hasAiKey ? 'configured' : 'not_configured';

    const allOk = ['database', 'redis'].every((k) => checks[k] === 'ok');
    const status = allOk ? 'healthy' : 'degraded';

    // Return HTTP 503 when degraded so load balancers and health checks
    // can correctly detect the service as unavailable.
    response.status(allOk ? 200 : 503);
    response.json({
      status,
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
