import { Injectable, Logger } from '@nestjs/common';
import { Interval, Cron } from '@nestjs/schedule';
import { IoTService } from './iot.service';
import { MockProvider } from './providers/mock.provider';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';

/** 调度任务执行记录 */
export interface ScheduledTaskResult {
  taskName: string;
  summary: string;
  devicesAffected: string[];
  notificationTitle: string;
  notificationBody: string;
}

/**
 * IoTSchedulerService — 时墨智能设备调度服务。
 *
 * 模拟时墨作为家庭 AI 管家，定时分析环境数据并主动派发任务给智能家居设备：
 * - 每天早上 7:00 — 晨间唤醒场景（开窗帘、调灯光）
 * - 每天中午 12:00 — 扫地机器人清扫路线规划
 * - 每天晚上 18:30 — 晚间归家场景（开灯、开空调）
 * - 每天晚上 22:00 — 睡眠模式（关灯、关空调、拉窗帘）
 * - 每 3 分钟 — 环境感知巡检（温湿度分析、空气质量联动）
 *
 * 每次任务执行后，时墨会向用户发送一条通知，描述分析过程和执行结果。
 */
@Injectable()
export class IoTSchedulerService {
  private readonly logger = new Logger(IoTSchedulerService.name);

  /** 巡检间隔（毫秒）— 演示用 3 分钟 */
  private readonly PATROL_INTERVAL_MS = 3 * 60 * 1000;

  /** 演示用户 ID — 从环境变量或默认 demo 用户获取 */
  private demoUserId: string | null = null;

  constructor(
    private readonly iotService: IoTService,
    private readonly mockProvider: MockProvider,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // 定时任务 — 场景自动化
  // ============================================================

  /** 晨间唤醒 07:00 — 时墨开启新一天 */
  @Cron('0 7 * * *', { name: 'morning-scene' })
  async morningScene() {
    const userId = await this.getDemoUserId();
    if (!userId) return;

    this.logger.log('🌅 执行晨间唤醒场景...');

    const actions: string[] = [];
    const devices: string[] = [];

    // 1. 打开客厅和卧室窗帘
    await this.control(userId, 'mock:curtain-living', 'turn_on');
    await this.control(userId, 'mock:curtain-bedroom', 'turn_on');
    actions.push('打开客厅和卧室窗帘，让阳光进来');
    devices.push('客厅窗帘', '卧室窗帘');

    // 2. 客厅主灯调到柔和亮度
    await this.control(userId, 'mock:light-living-main', 'set_property', 'brightness', 60);
    actions.push('客厅主灯调至 60% 柔和亮度');
    devices.push('客厅主灯');

    // 3. 根据阳台传感器温度决定是否开空调
    const balconySensor = this.mockProvider.getDeviceRef('mock:sensor-balcony');
    if (balconySensor) {
      const temp = Number(balconySensor.properties.temperature ?? 25);
      if (temp > 30) {
        await this.control(userId, 'mock:ac-living', 'turn_on');
        await this.control(userId, 'mock:ac-living', 'set_property', 'temperature', 26);
        actions.push(`阳台温度 ${temp}°C，开启客厅空调至 26°C`);
        devices.push('客厅空调');
      } else {
        actions.push(`阳台温度 ${temp}°C，无需开空调`);
      }
    }

    // 4. 启动扫地机器人（晨间快速清扫）
    const vacuumResult = await this.dispatchVacuumTask(userId, 'morning');
    if (vacuumResult) {
      actions.push(vacuumResult.summary);
      devices.push('扫地机器人');
    }

    const summary = `早安！时墨已为你准备好新的一天：\n${actions.map((a) => `• ${a}`).join('\n')}`;

    await this.sendNotification(userId, {
      taskName: '晨间唤醒',
      summary,
      devicesAffected: devices,
      notificationTitle: '🌅 时墨 · 晨间唤醒',
      notificationBody: summary,
    });
  }

  /** 午间清扫 12:00 — 扫地机器人深度清扫 */
  @Cron('0 12 * * *', { name: 'noon-vacuum' })
  async noonVacuumScene() {
    const userId = await this.getDemoUserId();
    if (!userId) return;

    this.logger.log('🤖 执行午间扫地机器人调度...');

    const result = await this.dispatchVacuumTask(userId, 'noon');
    if (!result) return;

    await this.sendNotification(userId, {
      taskName: '午间清扫',
      summary: result.summary,
      devicesAffected: ['扫地机器人'],
      notificationTitle: '🤖 时墨 · 扫地机器人已启动',
      notificationBody: result.summary,
    });
  }

  /** 晚间归家 18:30 — 时墨准备温馨回家场景 */
  @Cron('30 18 * * *', { name: 'evening-scene' })
  async eveningScene() {
    const userId = await this.getDemoUserId();
    if (!userId) return;

    this.logger.log('🏠 执行晚间归家场景...');

    const actions: string[] = [];
    const devices: string[] = [];

    // 1. 开启客厅灯光
    await this.control(userId, 'mock:light-living-main', 'turn_on');
    await this.control(userId, 'mock:light-living-main', 'set_property', 'brightness', 80);
    actions.push('客厅主灯已开启（80% 亮度）');
    devices.push('客厅主灯');

    // 2. 开启客厅氛围灯
    await this.control(userId, 'mock:light-living-ambient', 'turn_on');
    actions.push('客厅氛围灯已开启');
    devices.push('客厅氛围灯');

    // 3. 关闭窗帘
    await this.control(userId, 'mock:curtain-living', 'turn_off');
    actions.push('客厅窗帘已关闭');
    devices.push('客厅窗帘');

    // 4. 开启空调
    await this.control(userId, 'mock:ac-living', 'turn_on');
    await this.control(userId, 'mock:ac-living', 'set_property', 'temperature', 25);
    actions.push('客厅空调已开启（25°C 制冷模式）');
    devices.push('客厅空调');

    // 5. 检测空气质量，决定是否开净化器
    const purifier = this.mockProvider.getDeviceRef('mock:air-purifier-living');
    if (purifier) {
      const pm25 = Number(purifier.properties.pm25 ?? 35);
      if (pm25 > 50) {
        await this.control(userId, 'mock:air-purifier-living', 'turn_on');
        actions.push(`PM2.5 为 ${pm25}，已开启空气净化器`);
        devices.push('客厅空气净化器');
      } else {
        // 更新模拟 PM2.5 值
        purifier.properties.pm25 = Math.min(60, pm25 + Math.floor(Math.random() * 15));
        actions.push(`PM2.5 为 ${pm25}，空气质量良好`);
      }
    }

    const summary = `欢迎回家！时墨已为你调好居家模式：\n${actions.map((a) => `• ${a}`).join('\n')}`;

    await this.sendNotification(userId, {
      taskName: '晚间归家',
      summary,
      devicesAffected: devices,
      notificationTitle: '🏠 时墨 · 欢迎回家',
      notificationBody: summary,
    });
  }

  /** 睡眠模式 22:00 — 时墨帮你关灯睡觉 */
  @Cron('0 22 * * *', { name: 'sleep-scene' })
  async sleepScene() {
    const userId = await this.getDemoUserId();
    if (!userId) return;

    this.logger.log('🌙 执行睡眠模式...');

    const actions: string[] = [];
    const devices: string[] = [];

    // 1. 关闭所有灯光
    const allDevices = this.mockProvider.getAllDeviceRefs();
    for (const device of allDevices) {
      if (device.type === 'light' && device.status !== 'off') {
        await this.control(userId, device.id, 'turn_off');
        devices.push(device.name);
      }
    }
    actions.push('关闭全屋灯光');

    // 2. 关闭客厅空调，卧室空调调到睡眠模式
    await this.control(userId, 'mock:ac-living', 'turn_off');
    await this.control(userId, 'mock:ac-bedroom', 'turn_on');
    await this.control(userId, 'mock:ac-bedroom', 'set_property', 'temperature', 26);
    await this.control(userId, 'mock:ac-bedroom', 'set_property', 'mode', 'sleep');
    actions.push('客厅空调关闭，卧室空调调至 26°C 睡眠模式');
    devices.push('客厅空调', '卧室空调');

    // 3. 关闭窗帘
    await this.control(userId, 'mock:curtain-living', 'turn_off');
    await this.control(userId, 'mock:curtain-bedroom', 'turn_off');
    actions.push('全屋窗帘已关闭');
    devices.push('客厅窗帘', '卧室窗帘');

    // 4. 扫地机器人回充
    const vacuum = this.mockProvider.getDeviceRef('mock:robot-vacuum');
    if (vacuum && vacuum.status === 'running') {
      await this.control(userId, 'mock:robot-vacuum', 'turn_off');
      actions.push('扫地机器人已返回充电桩');
      devices.push('扫地机器人');
    }

    const summary = `晚安！时墨已为你切换到睡眠模式：\n${actions.map((a) => `• ${a}`).join('\n')}`;

    await this.sendNotification(userId, {
      taskName: '睡眠模式',
      summary,
      devicesAffected: devices,
      notificationTitle: '🌙 时墨 · 晚安',
      notificationBody: summary,
    });
  }

  // ============================================================
  // 环境巡检 — 每 3 分钟自动执行
  // ============================================================

  @Interval(3 * 60 * 1000)
  async environmentPatrol() {
    const userId = await this.getDemoUserId();
    if (!userId) return;

    const result = await this.analyzeEnvironment(userId);
    if (!result) return;

    await this.sendNotification(userId, result);
  }

  // ============================================================
  // 手动触发 — 供 Controller 调用
  // ============================================================

  /** 手动触发指定场景（供 API 调用） */
  async triggerScene(sceneName: string, userId: string): Promise<ScheduledTaskResult | null> {
    this.demoUserId = userId;
    switch (sceneName) {
      case 'morning':
        await this.morningScene();
        return null;
      case 'noon':
        await this.noonVacuumScene();
        return null;
      case 'evening':
        await this.eveningScene();
        return null;
      case 'sleep':
        await this.sleepScene();
        return null;
      case 'patrol':
        return this.analyzeEnvironment(userId);
      default:
        return null;
    }
  }

  // ============================================================
  // 核心逻辑 — 环境分析与设备调度
  // ============================================================

  /** 时墨分析全屋环境数据，智能调度设备 */
  private async analyzeEnvironment(userId: string): Promise<ScheduledTaskResult | null> {
    const devices = this.mockProvider.getAllDeviceRefs();
    const actions: string[] = [];
    const affectedDevices: string[] = [];

    // 1. 读取传感器数据
    const kitchenSensor = this.mockProvider.getDeviceRef('mock:sensor-kitchen');
    const balconySensor = this.mockProvider.getDeviceRef('mock:sensor-balcony');
    const purifier = this.mockProvider.getDeviceRef('mock:air-purifier-living');
    const livingAC = this.mockProvider.getDeviceRef('mock:ac-living');

    // 模拟传感器数据微小波动
    if (kitchenSensor) {
      const oldTemp = Number(kitchenSensor.properties.temperature ?? 28);
      const newTemp = Math.round((oldTemp + (Math.random() - 0.5) * 2) * 10) / 10;
      kitchenSensor.properties.temperature = newTemp;
      kitchenSensor.properties.humidity = Math.round(
        Math.max(30, Math.min(80, Number(kitchenSensor.properties.humidity ?? 65) + (Math.random() - 0.5) * 5)),
      );
    }
    if (balconySensor) {
      const oldTemp = Number(balconySensor.properties.temperature ?? 32);
      balconySensor.properties.temperature = Math.round((oldTemp + (Math.random() - 0.5) * 3) * 10) / 10;
    }
    if (purifier) {
      const oldPm = Number(purifier.properties.pm25 ?? 35);
      purifier.properties.pm25 = Math.max(10, Math.min(80, Math.round(oldPm + (Math.random() - 0.5) * 20)));
    }

    // 2. 厨房温度分析
    if (kitchenSensor) {
      const kitchenTemp = Number(kitchenSensor.properties.temperature ?? 28);
      const kitchenHumidity = Number(kitchenSensor.properties.humidity ?? 65);

      if (kitchenTemp > 30 && kitchenHumidity > 70) {
        actions.push(`厨房温度 ${kitchenTemp}°C、湿度 ${kitchenHumidity}%，环境偏热潮湿`);
        if (purifier && purifier.status !== 'running') {
          await this.control(userId, 'mock:air-purifier-living', 'turn_on');
          actions.push('已开启客厅空气净化器辅助通风');
          affectedDevices.push('客厅空气净化器');
        }
      } else if (kitchenTemp > 32) {
        actions.push(`厨房温度 ${kitchenTemp}°C 偏高，建议通风降温`);
        if (livingAC && livingAC.status === 'off') {
          await this.control(userId, 'mock:ac-living', 'turn_on');
          await this.control(userId, 'mock:ac-living', 'set_property', 'temperature', 25);
          actions.push('已自动开启客厅空调至 25°C');
          affectedDevices.push('客厅空调');
        }
      } else {
        actions.push(`厨房温度 ${kitchenTemp}°C、湿度 ${kitchenHumidity}%，环境正常`);
      }
    }

    // 3. 空气质量分析
    if (purifier) {
      const pm25 = Number(purifier.properties.pm25 ?? 35);
      if (pm25 > 55 && purifier.status !== 'running') {
        await this.control(userId, 'mock:air-purifier-living', 'turn_on');
        actions.push(`PM2.5 升至 ${pm25}，已开启空气净化器`);
        affectedDevices.push('客厅空气净化器');
      } else if (pm25 < 25 && purifier.status === 'running') {
        await this.control(userId, 'mock:air-purifier-living', 'turn_off');
        actions.push(`PM2.5 已降至 ${pm25}，关闭空气净化器节能`);
        affectedDevices.push('客厅空气净化器');
      } else {
        actions.push(`PM2.5 当前 ${pm25}，空气质量${pm25 < 35 ? '良好' : '中等'}`);
      }
    }

    // 4. 扫地机器人状态检查
    const vacuum = this.mockProvider.getDeviceRef('mock:robot-vacuum');
    if (vacuum) {
      const battery = Number(vacuum.properties.battery ?? 85);
      if (vacuum.status === 'charging' && battery >= 100) {
        actions.push(`扫地机器人电量已充满（${battery}%），待命中`);
      } else if (vacuum.status === 'running') {
        actions.push('扫地机器人正在清扫中');
      } else if (vacuum.status === 'charging') {
        actions.push(`扫地机器人充电中（${battery}%）`);
      }
    }

    // 5. 阳台环境分析
    if (balconySensor) {
      const balconyTemp = Number(balconySensor.properties.temperature ?? 32);
      const uvIndex = Number(balconySensor.properties.uvIndex ?? 7);
      if (balconyTemp > 33) {
        actions.push(`阳台温度 ${balconyTemp}°C，紫外线指数 ${uvIndex}，建议关窗开空调`);
      } else {
        actions.push(`阳台温度 ${balconyTemp}°C，户外环境适宜`);
      }
    }

    const summary = `🔍 环境巡检报告：\n${actions.map((a) => `• ${a}`).join('\n')}`;

    // 只有在有设备操作时才发通知
    if (affectedDevices.length === 0) {
      this.logger.log('环境巡检完成，无需操作设备');
      return null;
    }

    return {
      taskName: '环境巡检',
      summary,
      devicesAffected: affectedDevices,
      notificationTitle: '🔍 时墨 · 环境巡检',
      notificationBody: summary,
    };
  }

  /** 扫地机器人路线规划与派发 — 调用 MockProvider 生成详细路线并启动模拟 */
  private async dispatchVacuumTask(
    userId: string,
    period: 'morning' | 'noon',
  ): Promise<{ summary: string } | null> {
    const vacuum = this.mockProvider.getDeviceRef('mock:robot-vacuum');
    if (!vacuum) return null;

    const battery = Number(vacuum.properties.battery ?? 85);
    if (battery < 20) {
      return {
        summary: `扫地机器人电量不足（${battery}%），已跳过本次清扫，等待充电完成`,
      };
    }

    // 启动清扫模拟
    const mode = period === 'morning' ? 'quick' : 'deep';
    const route = this.mockProvider.startCleaning(mode, battery);

    // 生成路线描述
    const roomSequence = route.waypoints
      .filter((w) => w.action === 'enter')
      .map((w) => w.room)
      .join(' → ');

    const durationMin = Math.floor(route.estimatedDurationSec / 60);
    const durationSec = route.estimatedDurationSec % 60;

    const summary =
      `扫地机器人已启动${period === 'morning' ? '晨间快速清扫' : '午间深度清扫'}\n` +
      `📋 路线名称：${route.name}\n` +
      `🏠 清扫区域：${roomSequence}\n` +
      `📐 覆盖面积：${route.totalArea}㎡ · 路线节点：${route.waypoints.length} 个\n` +
      `⏱️ 预计耗时：${durationMin} 分 ${durationSec} 秒\n` +
      `🔋 当前电量：${battery}%\n` +
      `📍 起点充电桩 → ${roomSequence} → 返回充电桩`;

    return { summary };
  }

  /** 根据时段规划清扫路线（保留兼容） */
  private planVacuumRoute(period: 'morning' | 'noon'): string {
    if (period === 'morning') {
      return '客厅 → 走廊 → 阳台（仅高频区域）';
    }
    return '客厅 → 主卧 → 书房 → 厨房 → 走廊 → 阳台（全屋覆盖）';
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /** 控制设备并记录日志 */
  private async control(
    userId: string,
    deviceId: string,
    action: 'turn_on' | 'turn_off' | 'set_property',
    property?: string,
    value?: unknown,
  ): Promise<boolean> {
    return this.iotService.controlDevice(userId, {
      deviceId,
      action,
      property,
      value,
    });
  }

  /** 发送通知 */
  private async sendNotification(
    userId: string,
    result: ScheduledTaskResult,
  ): Promise<void> {
    try {
      await this.notificationService.create({
        userId,
        type: 'iot_schedule',
        title: result.notificationTitle,
        body: result.notificationBody,
        data: {
          taskName: result.taskName,
          devices: result.devicesAffected,
          summary: result.summary,
        },
      });
      this.logger.log(`通知已发送：${result.notificationTitle}`);
    } catch (error) {
      this.logger.warn(`通知发送失败：${(error as Error).message}`);
    }
  }

  /** 获取演示用户 ID — 优先使用手动设置的，否则从数据库查找 demo 用户 */
  private async getDemoUserId(): Promise<string | null> {
    if (this.demoUserId) return this.demoUserId;

    try {
      const demoUser = await this.prisma.user.findFirst({
        where: {
          email: { contains: 'demo' },
          status: 'active',
        },
        select: { id: true },
      });
      if (demoUser) {
        this.demoUserId = demoUser.id;
        this.logger.log(`已定位演示用户：${demoUser.id}`);
        return demoUser.id;
      }
    } catch (error) {
      this.logger.warn(`查找演示用户失败：${(error as Error).message}`);
    }

    return null;
  }

  /** 设置目标用户（由 Controller 调用时设置） */
  setUserId(userId: string) {
    this.demoUserId = userId;
  }
}
