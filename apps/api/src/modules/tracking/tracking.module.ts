import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';

/**
 * TrackingModule — 埋点追踪模块
 *
 * 提供前端页面访问与交互事件的采集及管理后台统计分析能力。
 *
 * - 公开接口：POST /tracking/events（无需认证）
 * - 管理接口：GET /tracking/overview | events | ip-list | hourly（需管理员权限）
 */
@Module({
  imports: [PrismaModule],
  providers: [TrackingService],
  controllers: [TrackingController],
  exports: [TrackingService],
})
export class TrackingModule {}
