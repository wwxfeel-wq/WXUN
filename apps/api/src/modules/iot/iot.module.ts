import { Module } from '@nestjs/common';
import { IoTController } from './iot.controller';
import { IoTService } from './iot.service';
import { MihomeProvider } from './providers/mihome.provider';
import { HomekitProvider } from './providers/homekit.provider';

/**
 * EchoLife IoT Module
 *
 * 智能硬件门面模块：聚合米家 / HomeKit 两大平台 Provider，
 * 对上层提供统一的设备列举、控制与凭证管理能力。
 *
 * 依赖全局 PrismaModule 提供的 PrismaService（在 AppModule 中已注册）。
 */
@Module({
  controllers: [IoTController],
  providers: [IoTService, MihomeProvider, HomekitProvider],
  exports: [IoTService],
})
export class IoTModule {}
