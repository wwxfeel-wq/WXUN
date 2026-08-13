import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { TrackingService } from './tracking.service';
import { TrackEventDto } from './dto/track-event.dto';
import { QueryTrackingDto } from './dto/query-tracking.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * TrackingController — 埋点追踪控制器
 *
 * 提供两个层级的接口：
 * 1. 公开上报接口（@Public）—— 供前端 SDK 调用，无需认证
 * 2. 管理后台统计接口 —— 需要 JWT 认证 + super_admin / operator 角色
 *
 * 由于 JwtAuthGuard 已全局注册，未标记 @Public() 的路由自动需要认证。
 * 管理接口额外通过 @UseGuards + @Roles 进行角色校验。
 */
@ApiTags('埋点追踪')
@ApiBearerAuth('JWT-auth')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  // ============================================================
  // Public: 事件上报
  // ============================================================

  @Public()
  @Post('events')
  @ApiOperation({
    summary: '上报埋点事件',
    description: '公开接口，前端 SDK 调用。自动从请求头中提取 IP 和 User-Agent。',
  })
  async trackEvent(
    @Body() dto: TrackEventDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; id?: string }> {
    const ipAddress = this.getClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;

    return this.trackingService.trackEvent(dto, ipAddress, userAgent);
  }

  // ============================================================
  // Admin: 概览统计
  // ============================================================

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'operator')
  @ApiOperation({
    summary: '获取埋点概览统计',
    description: '返回总浏览量、独立访客、独立 IP、热门页面、最近事件等聚合数据',
  })
  async getOverview() {
    return this.trackingService.getOverview();
  }

  // ============================================================
  // Admin: 事件列表（分页 + 筛选）
  // ============================================================

  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'operator')
  @ApiOperation({
    summary: '查询埋点事件列表',
    description: '分页获取埋点事件，支持按事件类型、IP 地址、时间范围筛选',
  })
  async getEvents(@Query() query: QueryTrackingDto) {
    return this.trackingService.getEvents(query);
  }

  // ============================================================
  // Admin: IP 访问列表
  // ============================================================

  @Get('ip-list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'operator')
  @ApiOperation({
    summary: '获取 IP 访问聚合列表',
    description: '返回各 IP 的访问次数、最后访问时间及地理位置信息',
  })
  async getIpList() {
    return this.trackingService.getIpList();
  }

  // ============================================================
  // Admin: 小时级统计（最近 24 小时）
  // ============================================================

  @Get('hourly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'operator')
  @ApiOperation({
    summary: '获取小时级访问统计',
    description: '返回最近 24 小时的逐小时事件数和独立访客数，用于趋势图表',
  })
  async getHourly() {
    return this.trackingService.getHourly();
  }

  // ============================================================
  // Private: 辅助方法
  // ============================================================

  /**
   * 从 HTTP 请求中提取客户端真实 IP。
   * 依次检查 x-forwarded-for、x-real-ip、x-client-ip 请求头，
   * 最后回退到 req.ip。
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') return realIp;
    const clientIp = req.headers['x-client-ip'];
    if (typeof clientIp === 'string') return clientIp;
    return req.ip || '0.0.0.0';
  }
}
