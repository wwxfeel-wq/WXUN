import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { IoTProviderInterface } from './iot-provider.interface';
import type {
  IoTDevice,
  DeviceControl,
  DeviceType,
  DeviceStatus,
} from '../types/iot.types';

/** Mock 设备初始定义 */
interface MockDeviceSeed {
  id: string;
  name: string;
  room: string;
  type: DeviceType;
  status: DeviceStatus;
  online: boolean;
  properties: Record<string, unknown>;
}

// ============================================================
// 扫地机器人清洗状态模型
// ============================================================

/** 清扫路线节点 — 房间内的一个路径点 */
export interface VacuumWaypoint {
  /** 房间名称 */
  room: string;
  /** 节点序号 */
  step: number;
  /** 坐标 X（0-100 的网格坐标） */
  x: number;
  /** 坐标 Y */
  y: number;
  /** 该节点动作 */
  action: 'enter' | 'clean' | 'turn' | 'avoid' | 'dock';
  /** 该节点耗时（秒） */
  durationSec: number;
  /** 该节点覆盖面积（㎡） */
  area: number;
  /** 是否已完成 */
  completed: boolean;
}

/** 清扫路线规划 */
export interface VacuumRoutePlan {
  /** 路线名称 */
  name: string;
  /** 模式 */
  mode: 'quick' | 'deep' | 'spot';
  /** 总面积（㎡） */
  totalArea: number;
  /** 预计总耗时（秒） */
  estimatedDurationSec: number;
  /** 路线节点列表 */
  waypoints: VacuumWaypoint[];
  /** 规划时间 */
  plannedAt: string;
}

/** 扫地机器人实时清洗状态 */
export interface VacuumCleaningState {
  /** 是否正在清扫 */
  isCleaning: boolean;
  /** 清扫模式 */
  mode: 'quick' | 'deep' | 'spot';
  /** 路线规划 */
  route: VacuumRoutePlan | null;
  /** 当前节点序号 */
  currentStep: number;
  /** 已覆盖面积（㎡） */
  cleanedArea: number;
  /** 已耗时（秒） */
  elapsedSec: number;
  /** 当前电量 */
  battery: number;
  /** 当前所在房间 */
  currentRoom: string;
  /** 清扫事件（障碍物、污渍等） */
  events: VacuumCleaningEvent[];
  /** 清扫开始时间 */
  startedAt: string | null;
  /** 清扫结束时间 */
  finishedAt: string | null;
}

/** 清扫过程中的事件 */
export interface VacuumCleaningEvent {
  /** 事件类型 */
  type: 'obstacle' | 'dirt_detect' | 'low_battery' | 'room_complete' | 'stuck' | 'dock';
  /** 发生时间 */
  timestamp: string;
  /** 所在房间 */
  room: string;
  /** 事件描述 */
  description: string;
  /** 对应的路线节点 */
  step: number;
}

/** 演示用智能家居设备清单 — 覆盖客厅/卧室/厨房/书房/阳台五个房间 */
const MOCK_DEVICE_SEEDS: MockDeviceSeed[] = [
  // ===== 客厅 =====
  {
    id: 'light-living-main',
    name: '客厅主灯',
    room: '客厅',
    type: 'light',
    status: 'on',
    online: true,
    properties: { brightness: 80, colorTemperature: 4000 },
  },
  {
    id: 'light-living-ambient',
    name: '客厅氛围灯',
    room: '客厅',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 30, colorTemperature: 2700 },
  },
  {
    id: 'ac-living',
    name: '客厅空调',
    room: '客厅',
    type: 'ac',
    status: 'off',
    online: true,
    properties: { temperature: 26, mode: 'cool', fanSpeed: 'auto' },
  },
  {
    id: 'curtain-living',
    name: '客厅窗帘',
    room: '客厅',
    type: 'curtain',
    status: 'on',
    online: true,
    properties: { position: 100 },
  },
  {
    id: 'robot-vacuum',
    name: '扫地机器人',
    room: '客厅',
    type: 'robot',
    status: 'charging',
    online: true,
    properties: {
      battery: 85,
      lastCleanArea: '48㎡',
      lastCleanTime: '2026-08-05 14:30',
      waterLevel: 'medium',
    },
  },
  {
    id: 'air-purifier-living',
    name: '客厅空气净化器',
    room: '客厅',
    type: 'air_purifier',
    status: 'off',
    online: true,
    properties: { pm25: 35, mode: 'auto', filterLife: 76 },
  },
  // ===== 主卧 =====
  {
    id: 'light-bedroom',
    name: '卧室灯',
    room: '主卧',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 60, colorTemperature: 3000 },
  },
  {
    id: 'ac-bedroom',
    name: '卧室空调',
    room: '主卧',
    type: 'ac',
    status: 'off',
    online: true,
    properties: { temperature: 25, mode: 'sleep', fanSpeed: 'low' },
  },
  {
    id: 'curtain-bedroom',
    name: '卧室窗帘',
    room: '主卧',
    type: 'curtain',
    status: 'off',
    online: true,
    properties: { position: 0 },
  },
  // ===== 厨房 =====
  {
    id: 'light-kitchen',
    name: '厨房灯',
    room: '厨房',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 100, colorTemperature: 5000 },
  },
  {
    id: 'sensor-kitchen',
    name: '厨房温湿度传感器',
    room: '厨房',
    type: 'sensor',
    status: 'on',
    online: true,
    properties: { temperature: 28, humidity: 65, battery: 92 },
  },
  // ===== 书房 =====
  {
    id: 'light-study',
    name: '书房台灯',
    room: '书房',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 70, colorTemperature: 4500 },
  },
  // ===== 阳台 =====
  {
    id: 'sensor-balcony',
    name: '阳台环境传感器',
    room: '阳台',
    type: 'sensor',
    status: 'on',
    online: true,
    properties: { temperature: 32, humidity: 45, lightLevel: 'high', uvIndex: 7 },
  },
  // ===== 智能冰箱（厨房） =====
  {
    id: 'fridge-kitchen',
    name: '智能冰箱',
    room: '厨房',
    type: 'fridge',
    status: 'on',
    online: true,
    properties: {
      temperature: 4,
      doorOpen: false,
      foodItems: [
        { name: '牛奶', expiryDays: 2, addedDays: 5 },
        { name: '鸡蛋', expiryDays: 8, addedDays: 10 },
        { name: '青菜', expiryDays: 0, addedDays: 3 },
        { name: '酸奶', expiryDays: 1, addedDays: 7 },
      ],
      healthScore: 85,
    },
  },
  // ===== 智能门锁（玄关） =====
  {
    id: 'door-lock-front',
    name: '智能门锁',
    room: '玄关',
    type: 'lock',
    status: 'on',
    online: true,
    properties: {
      locked: true,
      lastOpenTime: '2026-08-06 08:30',
      unlockCount: 3,
      batteryLevel: 72,
      autoLock: true,
    },
  },
  // ===== 烟雾报警器（厨房） =====
  {
    id: 'smoke-alarm-kitchen',
    name: '烟雾报警器',
    room: '厨房',
    type: 'alarm',
    status: 'on',
    online: true,
    properties: {
      smokeDetected: false,
      coLevel: 0,
      batteryLevel: 88,
      testPassed: true,
      lastTestDate: '2026-08-01',
    },
  },
  // ===== 智能药盒（主卧） =====
  {
    id: 'medicine-box-bedroom',
    name: '智能药盒',
    room: '主卧',
    type: 'medical',
    status: 'on',
    online: true,
    properties: {
      compartments: 4,
      nextDose: { time: '08:00', medication: '降压药', taken: false },
      missedDoses: 1,
      lastTakenTime: '2026-08-05 20:00',
    },
  },
  // ===== 智能摄像头（客厅） =====
  {
    id: 'camera-living',
    name: '智能摄像头',
    room: '客厅',
    type: 'camera',
    status: 'on',
    online: true,
    properties: {
      recording: false,
      motionDetected: true,
      nightVision: true,
      storageLeft: 76,
      lastMotionTime: '2026-08-06 07:15',
    },
  },
];

/**
 * Mock IoT Provider — 演示用本地虚拟设备平台。
 *
 * 不依赖任何外部 API，直接在内存中维护一组完整的智能家居设备。
 * 控制指令会实时更新内存状态，使前端和 Agent 能看到状态变化。
 * 用于比赛演示和开发测试，让时墨的 IoT 能力开箱即用。
 */
/** 房间布局坐标定义（用于路线规划） */
const ROOM_LAYOUT: Record<string, { x: number; y: number; w: number; h: number; area: number }> = {
  客厅: { x: 10, y: 10, w: 40, h: 35, area: 28 },
  主卧: { x: 55, y: 10, w: 35, h: 30, area: 18 },
  书房: { x: 55, y: 45, w: 35, h: 20, area: 12 },
  厨房: { x: 10, y: 50, w: 25, h: 20, area: 10 },
  走廊: { x: 38, y: 50, w: 12, h: 15, area: 5 },
  阳台: { x: 38, y: 70, w: 30, h: 15, area: 8 },
};

/** set_property 动作允许的属性名白名单，防止原型污染 */
const SAFE_PROPS = [
  'brightness', 'temperature', 'mode', 'speed', 'color',
  'power', 'status', 'level', 'fan_speed', 'swing',
  'volume', 'position',
];

/** 扫地机器人默认状态 */
function createDefaultVacuumState(): VacuumCleaningState {
  return {
    isCleaning: false,
    mode: 'quick',
    route: null,
    currentStep: 0,
    cleanedArea: 0,
    elapsedSec: 0,
    battery: 85,
    currentRoom: '客厅',
    events: [],
    startedAt: null,
    finishedAt: null,
  };
}

@Injectable()
export class MockProvider implements IoTProviderInterface, OnModuleDestroy {
  private readonly logger = new Logger(MockProvider.name);
  readonly platform = 'mock' as const;

  /** 内存中的设备状态，外层 key 为 userId，内层 key 为 deviceId */
  private readonly devices: Map<string, Map<string, IoTDevice>> = new Map();

  /** 扫地机器人清洗状态，按 userId 隔离 */
  private readonly vacuumStates: Map<string, VacuumCleaningState> = new Map();

  /** 模拟进度定时器，按 userId 隔离 */
  private readonly progressTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  /** R3-BUG-026: Per-user mutex for controlDevice to prevent concurrent modifications */
  private readonly controlMutexes = new Map<string, Promise<unknown>>();

  /** 清理指定用户的进度定时器 */
  private clearProgressTimer(userId: string): void {
    const timer = this.progressTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.progressTimers.delete(userId);
    }
  }

  onModuleDestroy(): void {
    for (const userId of this.progressTimers.keys()) {
      this.clearProgressTimer(userId);
    }
    // R3-BUG-007: Clear all maps to prevent memory leaks
    this.devices.clear();
    this.vacuumStates.clear();
    this.controlMutexes.clear();
  }

  /**
   * 获取（或初始化）指定用户的设备 Map。
   * 如果用户不存在，则为其初始化默认演示设备。
   */
  private getUserDevices(userId: string): Map<string, IoTDevice> {
    let userDevices = this.devices.get(userId);
    if (!userDevices) {
      userDevices = new Map();
      for (const seed of MOCK_DEVICE_SEEDS) {
        // H-039: 确保所有设备都有非空 name 属性
        const safeName = seed.name?.trim() || `未命名设备(${seed.id})`;
        userDevices.set(seed.id, { ...seed, name: safeName, properties: { ...seed.properties }, platform: 'mock' });
      }
      this.devices.set(userId, userDevices);
      this.logger.log(`MockProvider 已为用户 ${userId} 初始化 ${userDevices.size} 台演示设备`);
    }
    return userDevices;
  }

  /** 获取（或初始化）指定用户的扫地机器人状态 */
  private getUserVacuumState(userId: string): VacuumCleaningState {
    let state = this.vacuumStates.get(userId);
    if (!state) {
      state = createDefaultVacuumState();
      this.vacuumStates.set(userId, state);
    }
    return state;
  }

  async listDevices(userId: string): Promise<IoTDevice[]> {
    const userDevices = this.getUserDevices(userId);
    return Array.from(userDevices.values()).map((d) => ({
      ...d,
      // R4-BUG-002: 对外返回时补上 mock: 前缀，与统一设备 ID 格式一致
      id: `mock:${d.id}`,
      // H-039: 防御性兜底，确保 name 永远不为 null/空
      name: d.name?.trim() || `未命名设备(${d.id})`,
      properties: { ...d.properties },
    }));
  }

  async controlDevice(userId: string, control: DeviceControl): Promise<boolean> {
    // R3-BUG-026: Per-user mutex to prevent concurrent device control operations
    const mutexKey = `control:${userId}`;
    const prev = this.controlMutexes.get(mutexKey) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    this.controlMutexes.set(mutexKey, prev.then(() => next));

    await prev;
    try {
      return await this.controlDeviceInternal(userId, control);
    } finally {
      release();
      if (this.controlMutexes.get(mutexKey) === next) {
        this.controlMutexes.delete(mutexKey);
      }
    }
  }

  private async controlDeviceInternal(userId: string, control: DeviceControl): Promise<boolean> {
    const userDevices = this.getUserDevices(userId);
    // R4-BUG-002: 兼容带 mock: 前缀和不带前缀的 deviceId
    const nativeDeviceId = control.deviceId.replace(/^mock:/, '');
    const device = userDevices.get(nativeDeviceId);
    if (!device) {
      this.logger.warn(`Mock 设备不存在：${control.deviceId}`);
      return false;
    }
    if (!device.online) {
      this.logger.warn(`Mock 设备离线：${control.deviceId}`);
      return false;
    }

    // 属性名白名单验证，防止原型污染
    if (control.action === 'set_property' && control.property) {
      if (!SAFE_PROPS.includes(control.property)) {
        this.logger.warn(`Mock 设备属性名被拒绝：${control.property}`);
        return false;
      }
    }

    switch (control.action) {
      case 'turn_on':
        device.status = device.type === 'curtain' ? 'on' : 'on';
        if (device.type === 'robot') device.status = 'running';
        if (device.type === 'air_purifier') device.status = 'running';
        break;
      case 'turn_off':
        device.status = device.type === 'curtain' ? 'off' : 'off';
        if (device.type === 'robot') device.status = 'idle';
        if (device.type === 'air_purifier') device.status = 'idle';
        break;
      case 'set_property':
        if (control.property && control.value !== undefined) {
          device.properties[control.property] = control.value;
          if (control.property === 'brightness') {
            const val = Number(control.value);
            if (val === 0) device.status = 'off';
            else if (device.status === 'off') device.status = 'on';
          }
          if (control.property === 'position') {
            const val = Number(control.value);
            device.status = val > 0 ? 'on' : 'off';
          }
          if (control.property === 'mode' && control.value === 'start_cleaning') {
            device.status = 'running';
          }
        }
        break;
    }

    this.logger.log(
      `Mock 设备控制成功：${device.name} ← ${control.action}` +
        (control.property ? `(${control.property}=${control.value})` : ''),
    );
    return true;
  }

  async getDeviceStatus(
    userId: string,
    deviceId: string,
  ): Promise<IoTDevice | null> {
    const userDevices = this.getUserDevices(userId);
    // R4-BUG-002: 兼容带 mock: 前缀和不带前缀的 deviceId
    const nativeDeviceId = deviceId.replace(/^mock:/, '');
    const device = userDevices.get(nativeDeviceId);
    if (!device) return null;
    return {
      ...device,
      // R4-BUG-002: 对外返回时补上 mock: 前缀
      id: `mock:${device.id}`,
      // H-039: 防御性兜底
      name: device.name?.trim() || `未命名设备(${device.id})`,
      properties: { ...device.properties },
    };
  }

  async isAvailable(userId: string): Promise<boolean> {
    return true;
  }

  /** 获取设备原始引用（供 Scheduler 直接操作内存状态） */
  getDeviceRef(userId: string, deviceId: string): IoTDevice | undefined {
    const userDevices = this.getUserDevices(userId);
    // R4-BUG-002: 兼容带 mock: 前缀和不带前缀的 deviceId
    const nativeDeviceId = deviceId.replace(/^mock:/, '');
    return userDevices.get(nativeDeviceId);
  }

  /** 获取所有设备原始引用 */
  getAllDeviceRefs(userId: string): IoTDevice[] {
    const userDevices = this.getUserDevices(userId);
    return Array.from(userDevices.values());
  }

  // ============================================================
  // 扫地机器人 — 路线规划与模拟
  // ============================================================

  /** 规划清扫路线 */
  planVacuumRoute(mode: 'quick' | 'deep' | 'spot'): VacuumRoutePlan {
    const rooms = mode === 'quick'
      ? ['客厅', '走廊', '阳台']
      : mode === 'spot'
        ? ['客厅']
        : ['客厅', '走廊', '主卧', '书房', '厨房', '阳台'];

    const waypoints: VacuumWaypoint[] = [];
    let step = 0;

    // 起点充电桩
    waypoints.push({
      room: '客厅',
      step: step++,
      x: 15, y: 15,
      action: 'dock',
      durationSec: 5,
      area: 0,
      completed: false,
    });

    for (const room of rooms) {
      const layout = ROOM_LAYOUT[room];
      if (!layout) continue;

      // 进入房间
      waypoints.push({
        room,
        step: step++,
        x: layout.x + layout.w / 2,
        y: layout.y + layout.h / 2,
        action: 'enter',
        durationSec: 8,
        area: 0,
        completed: false,
      });

      // Z 字形清扫路径（3-5 个节点）
      const sweeps = mode === 'deep' ? 5 : mode === 'spot' ? 4 : 3;
      const sweepArea = layout.area / sweeps;
      for (let i = 0; i < sweeps; i++) {
        const isEven = i % 2 === 0;
        waypoints.push({
          room,
          step: step++,
          x: isEven ? layout.x + 5 : layout.x + layout.w - 5,
          y: layout.y + 5 + (i * (layout.h - 10)) / Math.max(1, sweeps - 1),
          action: i === sweeps - 1 ? 'turn' : 'clean',
          durationSec: mode === 'deep' ? 35 + Math.floor(Math.random() * 20) : 20 + Math.floor(Math.random() * 15),
          area: Math.round(sweepArea * 10) / 10,
          completed: false,
        });
      }

      // 深度模式：检测到障碍物
      if (mode === 'deep' && (room === '客厅' || room === '主卧')) {
        waypoints.push({
          room,
          step: step++,
          x: layout.x + layout.w * 0.7,
          y: layout.y + layout.h * 0.3,
          action: 'avoid',
          durationSec: 6,
          area: 0,
          completed: false,
        });
      }
    }

    // 返回充电桩
    waypoints.push({
      room: '客厅',
      step: step++,
      x: 15, y: 15,
      action: 'dock',
      durationSec: 10,
      area: 0,
      completed: false,
    });

    const totalArea = waypoints.reduce((sum, w) => sum + w.area, 0);
    const estimatedDurationSec = waypoints.reduce((sum, w) => sum + w.durationSec, 0);

    const routeName = mode === 'quick'
      ? '晨间快速清扫路线'
      : mode === 'spot'
        ? '客厅重点清扫路线'
        : '全屋深度清扫路线';

    return {
      name: routeName,
      mode,
      totalArea: Math.round(totalArea * 10) / 10,
      estimatedDurationSec,
      waypoints,
      plannedAt: new Date().toISOString(),
    };
  }

  /** 启动清扫模拟 */
  startCleaning(userId: string, mode: 'quick' | 'deep' | 'spot', battery: number): VacuumRoutePlan {
    const route = this.planVacuumRoute(mode);
    const vacuumState = this.getUserVacuumState(userId);

    vacuumState.isCleaning = true;
    vacuumState.mode = mode;
    vacuumState.route = route;
    vacuumState.currentStep = 0;
    vacuumState.cleanedArea = 0;
    vacuumState.elapsedSec = 0;
    vacuumState.battery = battery;
    vacuumState.currentRoom = '客厅';
    vacuumState.events = [{
      type: 'dock',
      timestamp: new Date().toISOString(),
      room: '客厅',
      description: '扫地机器人离开充电桩，开始执行清扫任务',
      step: 0,
    }];
    vacuumState.startedAt = new Date().toISOString();
    vacuumState.finishedAt = null;

    // 标记第一个节点完成
    if (route.waypoints.length > 0) {
      route.waypoints[0].completed = true;
      vacuumState.currentStep = 1;
    }

    // 启动进度模拟（每 3 秒推进一个节点）
    this.clearProgressTimer(userId);
    const timer = setInterval(() => this.tickProgress(userId), 3000);
    this.progressTimers.set(userId, timer);

    this.logger.log(`扫地机器人启动清扫：${route.name}，共 ${route.waypoints.length} 个节点`);
    return route;
  }

  /** 模拟进度推进 — 每 tick 完成一个节点 */
  private tickProgress(userId: string): void {
    const vacuumState = this.getUserVacuumState(userId);
    if (!vacuumState.isCleaning || !vacuumState.route) return;

    const route = vacuumState.route;
    const stepIdx = vacuumState.currentStep;

    if (stepIdx >= route.waypoints.length) {
      this.finishCleaning(userId);
      return;
    }

    const waypoint = route.waypoints[stepIdx];
    waypoint.completed = true;

    // 更新状态
    vacuumState.currentStep = stepIdx + 1;
    vacuumState.cleanedArea = Math.round(
      (vacuumState.cleanedArea + waypoint.area) * 10,
    ) / 10;
    vacuumState.elapsedSec += waypoint.durationSec;
    vacuumState.currentRoom = waypoint.room;

    // 电量消耗（每分钟约 2%）
    const batteryDrain = Math.round((waypoint.durationSec / 60) * 2 * 10) / 10;
    vacuumState.battery = Math.max(0, Math.round((vacuumState.battery - batteryDrain) * 10) / 10);

    // 更新设备属性
    const userDevices = this.getUserDevices(userId);
    const vacuum = userDevices.get('robot-vacuum');
    if (vacuum) {
      vacuum.status = 'running';
      vacuum.properties.battery = vacuumState.battery;
      vacuum.properties.cleanedArea = vacuumState.cleanedArea;
      vacuum.properties.currentRoom = vacuumState.currentRoom;
      vacuum.properties.progress = Math.round(
        (vacuumState.currentStep / route.waypoints.length) * 100,
      );
    }

    // 生成事件
    this.generateEvent(userId, waypoint);

    // 检查是否完成
    if (vacuumState.currentStep >= route.waypoints.length) {
      this.finishCleaning(userId);
    }
  }

  /** 根据节点生成清扫事件 */
  private generateEvent(userId: string, waypoint: VacuumWaypoint): void {
    const vacuumState = this.getUserVacuumState(userId);
    const event: VacuumCleaningEvent = {
      type: 'room_complete',
      timestamp: new Date().toISOString(),
      room: waypoint.room,
      description: '',
      step: waypoint.step,
    };

    switch (waypoint.action) {
      case 'enter':
        event.type = 'room_complete';
        event.description = `进入${waypoint.room}，开始清扫`;
        break;
      case 'clean':
        // 随机生成污渍检测事件
        if (Math.random() < 0.3) {
          vacuumState.events.push({
            type: 'dirt_detect',
            timestamp: new Date().toISOString(),
            room: waypoint.room,
            description: `在${waypoint.room}检测到顽固污渍，增加清扫力度`,
            step: waypoint.step,
          });
        }
        return;
      case 'avoid':
        event.type = 'obstacle';
        event.description = `在${waypoint.room}检测到障碍物，自动绕行`;
        break;
      case 'turn':
        event.type = 'room_complete';
        event.description = `${waypoint.room}清扫完成（覆盖 ${waypoint.area}㎡）`;
        break;
      case 'dock':
        if (vacuumState.currentStep > 1) {
          event.type = 'dock';
          event.description = '扫地机器人返回充电桩';
        } else {
          return; // 起点不发事件
        }
        break;
    }

    // 低电量告警
    if (vacuumState.battery < 20 && !vacuumState.events.some(e => e.type === 'low_battery')) {
      vacuumState.events.push({
        type: 'low_battery',
        timestamp: new Date().toISOString(),
        room: waypoint.room,
        description: `电量低于 20%（当前 ${vacuumState.battery}%），将在完成当前区域后返回充电`,
        step: waypoint.step,
      });
    }

    vacuumState.events.push(event);
  }

  /** 完成清扫 */
  private finishCleaning(userId: string): void {
    this.clearProgressTimer(userId);

    const vacuumState = this.getUserVacuumState(userId);
    vacuumState.isCleaning = false;
    vacuumState.finishedAt = new Date().toISOString();

    // 标记所有节点完成
    if (vacuumState.route) {
      for (const wp of vacuumState.route.waypoints) {
        wp.completed = true;
      }
    }

    // 更新设备状态
    const userDevices = this.getUserDevices(userId);
    const vacuum = userDevices.get('robot-vacuum');
    if (vacuum) {
      vacuum.status = 'charging';
      vacuum.properties.battery = vacuumState.battery;
      vacuum.properties.lastCleanArea = `${vacuumState.cleanedArea}㎡`;
      vacuum.properties.lastCleanTime = new Date().toLocaleString('zh-CN');
      vacuum.properties.progress = 100;
    }

    this.logger.log(
      `扫地机器人清扫完成：覆盖 ${vacuumState.cleanedArea}㎡，` +
      `耗时 ${Math.floor(vacuumState.elapsedSec / 60)} 分 ${vacuumState.elapsedSec % 60} 秒，` +
      `剩余电量 ${vacuumState.battery}%`,
    );
  }

  /** 获取扫地机器人清洗状态 */
  getVacuumState(userId: string): VacuumCleaningState {
    const vacuumState = this.getUserVacuumState(userId);
    return {
      ...vacuumState,
      route: vacuumState.route
        ? {
            ...vacuumState.route,
            waypoints: vacuumState.route.waypoints.map((w) => ({ ...w })),
          }
        : null,
      events: [...vacuumState.events],
    };
  }

  /** 停止清扫 */
  stopCleaning(userId: string): void {
    this.clearProgressTimer(userId);

    const vacuumState = this.getUserVacuumState(userId);
    vacuumState.isCleaning = false;
    vacuumState.finishedAt = new Date().toISOString();

    const userDevices = this.getUserDevices(userId);
    const vacuum = userDevices.get('robot-vacuum');
    if (vacuum) {
      vacuum.status = 'idle';
      vacuum.properties.battery = vacuumState.battery;
    }
  }
}
