import { Module } from '@nestjs/common';
import { IoTController } from './iot.controller';
import { IoTService } from './iot.service';
import { MihomeProvider } from './providers/mihome.provider';
import { HomekitProvider } from './providers/homekit.provider';
import { MockProvider } from './providers/mock.provider';
import { IoTSchedulerService } from './iot-scheduler.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * EchoLife IoT Module
 *
 * 智能硬件门面模块：聚合米家 / HomeKit / Mock 三大平台 Provider，
 * 对上层提供统一的设备列举、控制路由与平台凭证管理能力。
 *
 * Mock Provider 提供开箱即用的演示设备，时墨 Scheduler 定时分析
 * 环境并主动派发设备任务（扫地机路线规划、温控联动、灯光场景）。
 */
@Module({
  imports: [NotificationModule],
  controllers: [IoTController],
  providers: [IoTService, MihomeProvider, HomekitProvider, MockProvider, IoTSchedulerService],
  exports: [IoTService, IoTSchedulerService],
})
export class IoTModule {}
