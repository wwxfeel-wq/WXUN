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
import { MockProvider } from './providers/mock.provider';
import { ControlDeviceDto } from './dto/control-device.dto';
import { BindPlatformDto } from './dto/bind-platform.dto';
import { StartVacuumDto } from './dto/start-vacuum.dto';
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
    private readonly mockProvider: MockProvider,
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
    const result = await this.schedulerService.triggerScene(scene, userId);
    return {
      success: true,
      scene,
      result: result ?? { message: '场景已执行，查看通知了解详情' },
    };
  }

  // ============================================================
  // 扫地机器人 — 路线规划与实时状态
  // ============================================================

  @Get('vacuum/status')
  @ApiOperation({
    summary: '获取扫地机器人清洗状态',
    description: '返回扫地机器人的实时清洗状态，包括路线规划、当前进度、覆盖面积、电量和事件列表',
  })
  async getVacuumStatus(@CurrentUser('userId') userId: string) {
    return this.mockProvider.getVacuumState(userId);
  }

  @Post('vacuum/start')
  @ApiOperation({
    summary: '启动扫地机器人清扫',
    description: '手动启动扫地机器人清扫任务，支持 quick（快速）/ deep（深度）/ spot（重点）三种模式',
  })
  async startVacuum(
    @CurrentUser('userId') userId: string,
    @Body() dto: StartVacuumDto,
  ) {
    const mode = dto.mode ?? 'deep';
    const vacuum = this.mockProvider.getDeviceRef(userId, 'mock:robot-vacuum');
    const battery = Number(vacuum?.properties.battery ?? 85);

    const route = this.mockProvider.startCleaning(userId, mode, battery);

    const roomSequence = route.waypoints
      .filter((w) => w.action === 'enter')
      .map((w) => w.room)
      .join(' → ');

    const durationMin = Math.floor(route.estimatedDurationSec / 60);

    return {
      success: true,
      route,
      summary: {
        routeName: route.name,
        rooms: roomSequence,
        totalArea: route.totalArea,
        waypoints: route.waypoints.length,
        estimatedDuration: `${durationMin} 分钟`,
        battery,
      },
    };
  }

  @Post('vacuum/stop')
  @ApiOperation({
    summary: '停止扫地机器人清扫',
    description: '停止当前清扫任务，扫地机器人回到待机状态',
  })
  async stopVacuum(@CurrentUser('userId') userId: string) {
    this.mockProvider.stopCleaning(userId);
    return { success: true, message: '扫地机器人已停止清扫' };
  }
}
