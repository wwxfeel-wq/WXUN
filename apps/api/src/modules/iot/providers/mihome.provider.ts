import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import type { IoTProviderInterface } from './iot-provider.interface';
import type {
  IoTDevice,
  DeviceControl,
  DeviceType,
  DeviceStatus,
} from '../types/iot.types';

/** 米家 API 基础地址 */
const MIHOME_API_BASE = 'https://api2.mina.mi.com';

/** HTTP 请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 10000;

/** 米家设备列表响应中的单个设备原始结构 */
interface MihomeRawDevice {
  deviceid?: string;
  did?: string;
  name?: string;
  model?: string;
  roomName?: string;
  room_name?: string;
  isOnline?: boolean;
  is_online?: boolean;
  status?: string;
  properties?: Record<string, unknown>;
}

/** 米家设备列表响应结构 */
interface MihomeDeviceListResponse {
  code?: number;
  message?: string;
  data?: {
    list?: MihomeRawDevice[];
    devices?: MihomeRawDevice[];
  };
  result?: {
    list?: MihomeRawDevice[];
    devices?: MihomeRawDevice[];
  };
}

/**
 * 小米米家 IoT Provider。
 *
 * 通过米家开放 API（api2.mina.mi.com）列举与控制设备。access_token 从
 * IoTCredential 表读取；若凭证不存在或已过期，方法安全地返回空结果，
 * 不向上抛出异常，保证 IoTService 聚合调用不被单平台故障阻塞。
 */
@Injectable()
export class MihomeProvider implements IoTProviderInterface {
  private readonly logger = new Logger(MihomeProvider.name);
  readonly platform = 'mihome' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionUtil,
  ) {}

  // ============================================================
  // IoTProviderInterface
  // ============================================================

  async listDevices(userId: string): Promise<IoTDevice[]> {
    const token = await this.getAccessToken(userId);
    if (!token) return [];

    try {
      const url = `${MIHOME_API_BASE}/admin/v2/device/list`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EchoLife/1.0',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`米家设备列表请求失败：HTTP ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as MihomeDeviceListResponse;
      const rawDevices =
        payload?.data?.list ??
        payload?.data?.devices ??
        payload?.result?.list ??
        payload?.result?.devices ??
        [];

      return rawDevices
        .filter((d) => d && (d.deviceid || d.did))
        .map((d) => this.normalizeDevice(d));
    } catch (error) {
      this.logger.warn(
        `米家 listDevices 失败：${(error as Error).message}`,
      );
      return [];
    }
  }

  async controlDevice(userId: string, control: DeviceControl): Promise<boolean> {
    const token = await this.getAccessToken(userId);
    if (!token) return false;

    try {
      const body = this.buildControlPayload(control);
      const url = `${MIHOME_API_BASE}/home/devicecontrol`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EchoLife/1.0',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `米家控制设备失败 (${control.deviceId})：HTTP ${response.status}`,
        );
        return false;
      }

      const result = (await response.json()) as { code?: number; message?: string };
      // 米家成功响应通常 code === 0
      if (result && typeof result.code === 'number' && result.code !== 0) {
        this.logger.warn(
          `米家控制设备返回错误码 (${control.deviceId})：${result.code} ${result.message ?? ''}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `米家 controlDevice 失败 (${control.deviceId})：${(error as Error).message}`,
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
    const token = await this.getAccessToken(userId);
    return !!token;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /** 从 IoTCredential 表读取未过期的 access token */
  private async getAccessToken(userId: string): Promise<string | null> {
    try {
      const credential = await this.prisma.ioTCredential.findUnique({
        where: { userId_platform: { userId, platform: 'mihome' } },
      });

      if (!credential?.accessToken) return null;

      // 凭证过期判定
      if (credential.expiresAt && credential.expiresAt.getTime() < Date.now()) {
        this.logger.debug(`米家 access_token 已过期 (user=${userId})`);
        return null;
      }

      try {
        return this.encryption.decrypt(credential.accessToken);
      } catch {
        this.logger.warn(`米家 access_token 解密失败，返回 null 以避免使用原始密文 (user=${userId})`);
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `读取米家凭证失败：${(error as Error).message}`,
      );
      return null;
    }
  }

  /** 将米家原始设备映射为统一 IoTDevice 模型 */
  private normalizeDevice(raw: MihomeRawDevice): IoTDevice {
    const nativeId = String(raw.deviceid ?? raw.did ?? '');
    const model = raw.model ?? '';
    const name = raw.name ?? '未命名设备';
    const room = raw.roomName ?? raw.room_name ?? '默认房间';
    const online = raw.isOnline ?? raw.is_online ?? true;

    return {
      id: `mihome:${nativeId}`,
      platform: 'mihome',
      name,
      room,
      type: this.mapDeviceType(model),
      status: this.mapDeviceStatus(raw),
      properties: raw.properties ?? {},
      online,
    };
  }

  /** 米家设备 model → DeviceType 映射 */
  private mapDeviceType(model: string): DeviceType {
    const lower = model.toLowerCase();
    if (/(yeelight|light|lamp|bulb)/.test(lower)) return 'light';
    if (/(aircond|ac-|air_condition|kongtiao|lumi.airrtc)/.test(lower)) return 'ac';
    if (/(roborock|robot|vacuum|扫地|robotcleaner)/.test(lower)) {
      return lower.includes('mop') || lower.includes('robot') ? 'robot' : 'vacuum';
    }
    if (/(sensor|motion|htct|weather|lumi.sensor)/.test(lower)) return 'sensor';
    if (/(plug|switch|ctrl|chuangmi.plug)/.test(lower)) return 'switch';
    if (/(curtain|lumi.curtain)/.test(lower)) return 'curtain';
    if (/(airpurifier|air_purifier|purifier)/.test(lower)) return 'air_purifier';
    return 'switch';
  }

  /** 米家设备 status 字段 → DeviceStatus 映射 */
  private mapDeviceStatus(raw: MihomeRawDevice): DeviceStatus {
    const status = String(raw.status ?? '').toLowerCase();
    const online = raw.isOnline ?? raw.is_online ?? true;
    if (!online) return 'off';
    if (/(run|running|busy|working)/.test(status)) return 'running';
    if (/(charge)/.test(status)) return 'charging';
    if (/(on|open)/.test(status)) return 'on';
    if (/(off|close|stop)/.test(status)) return 'off';
    return 'idle';
  }

  /** 根据 DeviceControl 构造米家 MIoT 控制指令体 */
  private buildControlPayload(control: DeviceControl): Record<string, unknown> {
    const did = control.deviceId.replace(/^mihome:/, '');
    switch (control.action) {
      case 'turn_on':
        return { did, method: 'set_properties', params: [{ piid: 1, value: true }] };
      case 'turn_off':
        return { did, method: 'set_properties', params: [{ piid: 1, value: false }] };
      case 'set_property':
        return {
          did,
          method: 'set_properties',
          params: [{ piid: Number(control.property ?? 2), value: control.value }],
        };
      default:
        return { did, method: 'get_properties', params: [] };
    }
  }
}
