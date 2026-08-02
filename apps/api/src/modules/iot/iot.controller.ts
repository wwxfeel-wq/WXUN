import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IoTService } from './iot.service';
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
  constructor(private readonly iotService: IoTService) {}

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
}
