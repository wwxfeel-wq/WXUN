import { Injectable, Logger } from '@nestjs/common';
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

/** 演示用智能家居设备清单 — 覆盖客厅/卧室/厨房/书房/阳台五个房间 */
const MOCK_DEVICE_SEEDS: MockDeviceSeed[] = [
  // ===== 客厅 =====
  {
    id: 'mock:light-living-main',
    name: '客厅主灯',
    room: '客厅',
    type: 'light',
    status: 'on',
    online: true,
    properties: { brightness: 80, colorTemperature: 4000 },
  },
  {
    id: 'mock:light-living-ambient',
    name: '客厅氛围灯',
    room: '客厅',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 30, colorTemperature: 2700 },
  },
  {
    id: 'mock:ac-living',
    name: '客厅空调',
    room: '客厅',
    type: 'ac',
    status: 'off',
    online: true,
    properties: { temperature: 26, mode: 'cool', fanSpeed: 'auto' },
  },
  {
    id: 'mock:curtain-living',
    name: '客厅窗帘',
    room: '客厅',
    type: 'curtain',
    status: 'on',
    online: true,
    properties: { position: 100 },
  },
  {
    id: 'mock:robot-vacuum',
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
    id: 'mock:air-purifier-living',
    name: '客厅空气净化器',
    room: '客厅',
    type: 'air_purifier',
    status: 'off',
    online: true,
    properties: { pm25: 35, mode: 'auto', filterLife: 76 },
  },
  // ===== 主卧 =====
  {
    id: 'mock:light-bedroom',
    name: '卧室灯',
    room: '主卧',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 60, colorTemperature: 3000 },
  },
  {
    id: 'mock:ac-bedroom',
    name: '卧室空调',
    room: '主卧',
    type: 'ac',
    status: 'off',
    online: true,
    properties: { temperature: 25, mode: 'sleep', fanSpeed: 'low' },
  },
  {
    id: 'mock:curtain-bedroom',
    name: '卧室窗帘',
    room: '主卧',
    type: 'curtain',
    status: 'off',
    online: true,
    properties: { position: 0 },
  },
  // ===== 厨房 =====
  {
    id: 'mock:light-kitchen',
    name: '厨房灯',
    room: '厨房',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 100, colorTemperature: 5000 },
  },
  {
    id: 'mock:sensor-kitchen',
    name: '厨房温湿度传感器',
    room: '厨房',
    type: 'sensor',
    status: 'on',
    online: true,
    properties: { temperature: 28, humidity: 65, battery: 92 },
  },
  // ===== 书房 =====
  {
    id: 'mock:light-study',
    name: '书房台灯',
    room: '书房',
    type: 'light',
    status: 'off',
    online: true,
    properties: { brightness: 70, colorTemperature: 4500 },
  },
  // ===== 阳台 =====
  {
    id: 'mock:sensor-balcony',
    name: '阳台环境传感器',
    room: '阳台',
    type: 'sensor',
    status: 'on',
    online: true,
    properties: { temperature: 32, humidity: 45, lightLevel: 'high', uvIndex: 7 },
  },
];

/**
 * Mock IoT Provider — 演示用本地虚拟设备平台。
 *
 * 不依赖任何外部 API，直接在内存中维护一组完整的智能家居设备。
 * 控制指令会实时更新内存状态，使前端和 Agent 能看到状态变化。
 * 用于比赛演示和开发测试，让时墨的 IoT 能力开箱即用。
 */
@Injectable()
export class MockProvider implements IoTProviderInterface {
  private readonly logger = new Logger(MockProvider.name);
  readonly platform = 'mock' as const;

  /** 内存中的设备状态，key 为 deviceId */
  private readonly devices: Map<string, IoTDevice> = new Map();

  constructor() {
    for (const seed of MOCK_DEVICE_SEEDS) {
      this.devices.set(seed.id, { ...seed, platform: 'mock' });
    }
    this.logger.log(`MockProvider 已加载 ${this.devices.size} 台演示设备`);
  }

  async listDevices(_userId: string): Promise<IoTDevice[]> {
    return Array.from(this.devices.values()).map((d) => ({ ...d, properties: { ...d.properties } }));
  }

  async controlDevice(_userId: string, control: DeviceControl): Promise<boolean> {
    const device = this.devices.get(control.deviceId);
    if (!device) {
      this.logger.warn(`Mock 设备不存在：${control.deviceId}`);
      return false;
    }
    if (!device.online) {
      this.logger.warn(`Mock 设备离线：${control.deviceId}`);
      return false;
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
    _userId: string,
    deviceId: string,
  ): Promise<IoTDevice | null> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    return { ...device, properties: { ...device.properties } };
  }

  async isAvailable(_userId: string): Promise<boolean> {
    return true;
  }

  /** 获取设备原始引用（供 Scheduler 直接操作内存状态） */
  getDeviceRef(deviceId: string): IoTDevice | undefined {
    return this.devices.get(deviceId);
  }

  /** 获取所有设备原始引用 */
  getAllDeviceRefs(): IoTDevice[] {
    return Array.from(this.devices.values());
  }
}
