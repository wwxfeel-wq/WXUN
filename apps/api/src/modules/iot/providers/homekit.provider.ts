import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import type { IoTProviderInterface } from './iot-provider.interface';
import type {
  IoTDevice,
  DeviceControl,
  DeviceType,
} from '../types/iot.types';

/** HTTP 请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 10000;

/** Homebridge 连接配置（存储于 IoTCredential.metadata） */
interface HomebridgeConfig {
  homebridgeUrl: string;
  authToken?: string;
}

/** HAP 单个特征 */
interface HapCharacteristic {
  iid: number;
  type: string;
  value?: unknown;
  description?: string;
  format?: string;
  perms?: string[];
}

/** HAP 单个服务 */
interface HapService {
  iid: number;
  type: string;
  characteristics: HapCharacteristic[];
  primaryService?: boolean;
}

/** HAP 单个附件 */
interface HapAccessory {
  aid: number;
  services: HapService[];
}

/** Homebridge /accessories 响应结构 */
interface HomebridgeAccessoriesResponse {
  accessories?: HapAccessory[];
}

/** 属性名 → HAP 特征短 UUID 映射（用于 set_property） */
const PROPERTY_TO_HAP_TYPE: Record<string, string> = {
  on: '00000025',
  brightness: '00000008',
  colorTemperature: '00000013',
  hue: '00000013',
  saturation: '0000002F',
  currentTemperature: '00000011',
  targetTemperature: '00000035',
  rotationSpeed: '00000029',
  position: '0000006C', // CurrentPosition (curtain)
};

/**
 * HomeKit / Homebridge IoT Provider。
 *
 * 通过 Homebridge REST API 暴露的 HAP 接口列举与控制配件。连接配置
 * （homebridgeUrl / authToken）存储于 IoTCredential.metadata。
 * 若配置缺失或 Homebridge 不可达，方法安全返回空结果，不阻塞聚合调用。
 */
@Injectable()
export class HomekitProvider implements IoTProviderInterface {
  private readonly logger = new Logger(HomekitProvider.name);
  readonly platform = 'homekit' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionUtil,
  ) {}

  // ============================================================
  // IoTProviderInterface
  // ============================================================

  async listDevices(userId: string): Promise<IoTDevice[]> {
    const config = await this.getConfig(userId);
    if (!config) return [];

    try {
      const response = await fetch(`${config.homebridgeUrl}/accessories`, {
        headers: this.buildHeaders(config),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`Homebridge 设备列表请求失败：HTTP ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as HomebridgeAccessoriesResponse;
      const accessories = payload?.accessories ?? [];

      return accessories
        .map((acc) => this.normalizeAccessory(acc))
        .filter((d): d is IoTDevice => d !== null);
    } catch (error) {
      this.logger.warn(
        `Homekit listDevices 失败：${(error as Error).message}`,
      );
      return [];
    }
  }

  async controlDevice(userId: string, control: DeviceControl): Promise<boolean> {
    const config = await this.getConfig(userId);
    if (!config) return false;

    try {
      const accessory = await this.findAccessory(config, control.deviceId);
      if (!accessory) {
        this.logger.warn(`Homebridge 未找到设备 ${control.deviceId}`);
        return false;
      }

      const target = this.resolveCharacteristic(accessory, control);
      if (!target) {
        this.logger.warn(
          `Homebridge 无法解析控制特征 (${control.deviceId}/${control.action})`,
        );
        return false;
      }

      const body = {
        characteristics: [{ aid: accessory.aid, iid: target.iid, value: target.value }],
      };

      const response = await fetch(`${config.homebridgeUrl}/characteristics`, {
        method: 'PUT',
        headers: {
          ...this.buildHeaders(config),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // Homebridge 成功通常返回 204 No Content 或 200
      if (!response.ok) {
        this.logger.warn(
          `Homebridge 控制设备失败 (${control.deviceId})：HTTP ${response.status}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Homekit controlDevice 失败 (${control.deviceId})：${(error as Error).message}`,
      );
      return false;
    }
  }

  async getDeviceStatus(
    userId: string,
    deviceId: string,
  ): Promise<IoTDevice | null> {
    const devices = await this.listDevices(userId);
    return devices.find((d) => d.id === deviceId) ?? null;
  }

  async isAvailable(userId: string): Promise<boolean> {
    const config = await this.getConfig(userId);
    return !!config;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /** 从 IoTCredential.metadata 读取 Homebridge 连接配置 */
  private async getConfig(userId: string): Promise<HomebridgeConfig | null> {
    try {
      const credential = await this.prisma.ioTCredential.findUnique({
        where: { userId_platform: { userId, platform: 'homekit' } },
      });

      if (!credential?.metadata) return null;

      const meta = credential.metadata as Record<string, unknown>;
      const homebridgeUrl = meta?.homebridgeUrl;
      if (typeof homebridgeUrl !== 'string' || !homebridgeUrl) return null;
      if (!this.validateUrl(homebridgeUrl)) {
        this.logger.warn(`Homebridge URL 被拒绝（SSRF 防护）：${homebridgeUrl}`);
        return null;
      }

      const rawAuthToken =
        typeof meta?.authToken === 'string' ? (meta.authToken as string) : undefined;
      let authToken: string | undefined;
      if (rawAuthToken) {
        try {
          authToken = this.encryption.decrypt(rawAuthToken);
        } catch {
          this.logger.warn(`Homebridge authToken 解密失败，返回 null 以避免使用原始密文 (user=${userId})`);
          authToken = undefined;
        }
      }

      return { homebridgeUrl: homebridgeUrl.replace(/\/$/, ''), authToken };
    } catch (error) {
      this.logger.warn(
        `读取 Homebridge 配置失败：${(error as Error).message}`,
      );
      return null;
    }
  }

  private validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const hostname = parsed.hostname;
      if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) return false;
      if (hostname === 'metadata.google.internal') return false;
      if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return false;
      return true;
    } catch {
      return false;
    }
  }

  /** 构造 Homebridge 请求头 */
  private buildHeaders(config: HomebridgeConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'EchoLife/1.0',
    };
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }
    return headers;
  }

  /** 拉取并查找指定 aid 的 accessory */
  private async findAccessory(
    config: HomebridgeConfig,
    deviceId: string,
  ): Promise<HapAccessory | null> {
    const nativeId = deviceId.replace(/^homekit:/, '');
    const aid = Number(nativeId);
    if (Number.isNaN(aid)) return null;

    try {
      const response = await fetch(`${config.homebridgeUrl}/accessories`, {
        headers: this.buildHeaders(config),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as HomebridgeAccessoriesResponse;
      return (payload?.accessories ?? []).find((a) => a.aid === aid) ?? null;
    } catch {
      return null;
    }
  }

  /** 解析控制动作对应的目标特征与写入值 */
  private resolveCharacteristic(
    accessory: HapAccessory,
    control: DeviceControl,
  ): { iid: number; value: unknown } | null {
    switch (control.action) {
      case 'turn_on': {
        const on = this.findCharacteristicByType(accessory, '00000025');
        return on ? { iid: on.iid, value: true } : null;
      }
      case 'turn_off': {
        const on = this.findCharacteristicByType(accessory, '00000025');
        return on ? { iid: on.iid, value: false } : null;
      }
      case 'set_property': {
        const typeShort = PROPERTY_TO_HAP_TYPE[control.property ?? ''];
        if (!typeShort) return null;
        const ch = this.findCharacteristicByType(accessory, typeShort);
        return ch ? { iid: ch.iid, value: control.value } : null;
      }
      default:
        return null;
    }
  }

  /** 按短 UUID 在 accessory 中查找特征 */
  private findCharacteristicByType(
    accessory: HapAccessory,
    typeShort: string,
  ): HapCharacteristic | null {
    for (const service of accessory.services ?? []) {
      for (const ch of service.characteristics ?? []) {
        // HAP type 形如 "00000025-0000-1000-8000-0026BB765291"
        if (ch.type && ch.type.toUpperCase().startsWith(typeShort.toUpperCase())) {
          return ch;
        }
      }
    }
    return null;
  }

  /** 将 HAP accessory 映射为统一 IoTDevice 模型 */
  private normalizeAccessory(accessory: HapAccessory): IoTDevice | null {
    const primaryService = this.getPrimaryService(accessory);
    if (!primaryService) return null;

    const name = this.getCharacteristicValue(accessory, '00000020') as string;
    const on = this.findCharacteristicByType(accessory, '00000025');
    const isOn = on?.value === true || on?.value === 1;
    const reachable = this.findCharacteristicByType(accessory, '00000063');

    return {
      id: `homekit:${accessory.aid}`,
      platform: 'homekit',
      name: name || `Homekit 设备 ${accessory.aid}`,
      room: '默认房间',
      type: this.mapServiceTypeToDeviceType(primaryService.type),
      status: isOn ? 'on' : 'off',
      properties: this.extractProperties(accessory),
      online: reachable ? reachable.value !== false : true,
    };
  }

  /** 取 accessory 的主服务（primaryService 标记或第一个非 AccessoryInformation） */
  private getPrimaryService(accessory: HapAccessory): HapService | null {
    const services = accessory.services ?? [];
    if (services.length === 0) return null;
    return (
      services.find((s) => s.primaryService) ??
      services.find(
        (s) => !s.type.toUpperCase().startsWith('0000003E'), // AccessoryInformation
      ) ??
      services[0]
    );
  }

  /** 取某个特征的当前值 */
  private getCharacteristicValue(
    accessory: HapAccessory,
    typeShort: string,
  ): unknown {
    return this.findCharacteristicByType(accessory, typeShort)?.value;
  }

  /** 提取常用属性（亮度 / 温度 等） */
  private extractProperties(accessory: HapAccessory): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const brightness = this.findCharacteristicByType(accessory, '00000008');
    if (brightness?.value !== undefined) props.brightness = brightness.value;
    const currentTemp = this.findCharacteristicByType(accessory, '00000011');
    if (currentTemp?.value !== undefined) props.currentTemperature = currentTemp.value;
    const targetTemp = this.findCharacteristicByType(accessory, '00000035');
    if (targetTemp?.value !== undefined) props.targetTemperature = targetTemp.value;
    return props;
  }

  /** HAP 服务类型 UUID → DeviceType 映射 */
  private mapServiceTypeToDeviceType(serviceType: string): DeviceType {
    const t = serviceType.toUpperCase();
    if (t.startsWith('00000043')) return 'light'; // Lightbulb
    if (t.startsWith('00000040')) return 'switch'; // Fan
    if (t.startsWith('0000008A')) return 'air_purifier'; // AirPurifier
    if (t.startsWith('00000041')) return 'switch'; // Outlet
    if (t.startsWith('00000047')) return 'curtain'; // WindowCovering
    if (t.startsWith('0000007E')) return 'switch'; // Switch
    if (t.startsWith('00000080') || t.startsWith('0000008B') || t.startsWith('00000091')) {
      return 'sensor';
    }
    if (t.startsWith('000000BB')) return 'switch'; // Switch (legacy)
    return 'switch';
  }
}
