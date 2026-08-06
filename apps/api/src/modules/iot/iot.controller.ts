import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IoTService } from './iot.service';
import { IoTSchedulerService } from './iot-scheduler.service';
import { ControlDeviceDto } from './dto/control-device.dto';
import { BindPlatformDto } from './dto/bind-platform.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { IoTPlatform } from './types/iot.types';

@ApiTags('IoT 智能硬件')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('iot')
export class IoTController {
  constructor(
    private readonly iotService: IoTService,
    private readonly schedulerService: IoTSchedulerService,
  ) {}

  @Get('devices')
  @ApiOperation({
    summary: '列出所有设备',
    description: '聚合米家 / HomeKit 等已绑定平台的所有设备，返回统一设备模型',
  })
  async listDevices(@CurrentUser('userId') userId: string) {
    const devices = await this.iotService.listAllDevices(userId);
    return { devices, count: devices.length };
  }

  @Post('devices/control')
  @ApiOperation({
    summary: '控制设备',
    description: '下发控制指令，自动按 deviceId 前缀路由到对应平台',
  })
  async controlDevice(
    @CurrentUser('userId') userId: string,
    @Body() dto: ControlDeviceDto,
  ) {
    const success = await this.iotService.controlDevice(userId, dto);
    return { success };
  }

  @Get('bindings')
  @ApiOperation({
    summary: '查询已绑定平台',
    description: '返回用户已绑定与可绑定的 IoT 平台列表',
  })
  async getBindings(@CurrentUser('userId') userId: string) {
    const bindings = await this.iotService.getBindings(userId);
    return { bindings };
  }

  @Post('bind/:platform')
  @ApiOperation({
    summary: '绑定平台',
    description:
      '绑定米家（accessToken/refreshToken）或 HomeKit（homebridgeUrl/authToken）平台凭证',
  })
  async bindPlatform(
    @CurrentUser('userId') userId: string,
    @Param('platform') platform: string,
    @Body() dto: BindPlatformDto,
  ) {
    await this.iotService.bindPlatform(userId, platform as IoTPlatform, dto);
    return { success: true, platform };
  }

  @Delete('bind/:platform')
  @ApiOperation({
    summary: '解绑平台',
    description: '删除指定平台的绑定凭证',
  })
  async unbindPlatform(
    @CurrentUser('userId') userId: string,
    @Param('platform') platform: string,
  ) {
    await this.iotService.unbindPlatform(userId, platform as IoTPlatform);
    return { success: true, platform };
  }

  @Post('scene/:scene')
  @ApiOperation({
    summary: '触发智能场景',
    description:
      '手动触发时墨的设备调度场景：morning（晨间唤醒）/ noon（午间清扫）/ evening（晚间归家）/ sleep（睡眠模式）/ patrol（环境巡检）',
  })
  async triggerScene(
    @CurrentUser('userId') userId: string,
    @Param('scene') scene: string,
  ) {
    this.schedulerService.setUserId(userId);
    const result = await this.schedulerService.triggerScene(scene, userId);
    return {
      success: true,
      scene,
      result: result ?? { message: '场景已执行，查看通知了解详情' },
    };
  }
}
