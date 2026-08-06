import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MihomeProvider } from './providers/mihome.provider';
import { HomekitProvider } from './providers/homekit.provider';
import { MockProvider } from './providers/mock.provider';
import type { IoTProviderInterface } from './providers/iot-provider.interface';
import type {
  IoTDevice,
  DeviceControl,
  IoTPlatform,
  PlatformCredentials,
  PlatformBinding,
} from './types/iot.types';

/**
 * IoTService — 智能硬件门面服务。
 *
 * 聚合多个 IoT 平台 Provider（米家 / HomeKit），对上层提供统一的设备列举、
 * 控制路由与平台凭证管理能力。设备 ID 采用 `${platform}:${nativeId}` 编码，
 * 控制时自动按前缀路由到对应平台；若无前缀则顺序尝试所有平台。
 */
@Injectable()
export class IoTService {
  private readonly logger = new Logger(IoTService.name);
  private readonly providers: Map<IoTPlatform, IoTProviderInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mihomeProvider: MihomeProvider,
    private readonly homekitProvider: HomekitProvider,
    private readonly mockProvider: MockProvider,
  ) {
    this.providers = new Map<IoTPlatform, IoTProviderInterface>([
      ['mihome', mihomeProvider],
      ['homekit', homekitProvider],
      ['mock', mockProvider],
    ]);
  }

  // ============================================================
  // 设备列举与控制
  // ============================================================

  /**
   * 聚合所有已绑定平台的设备列表。
   * 单个平台失败不影响其他平台的结果。
   */
  async listAllDevices(userId: string): Promise<IoTDevice[]> {
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map((p) => p.listDevices(userId)),
    );

    const devices: IoTDevice[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        devices.push(...result.value);
      } else {
        const provider = Array.from(this.providers.values())[index];
        this.logger.warn(
          `Provider ${provider.platform} listDevices 被拒绝：${result.reason}`,
        );
      }
    });

    return devices;
  }

  /**
   * 控制设备 —— 自动按 deviceId 前缀路由到对应平台。
   * 无前缀或未知平台时，顺序尝试所有平台，命中即返回。
   */
  async controlDevice(userId: string, control: DeviceControl): Promise<boolean> {
    const { platform, nativeId } = this.parsePlatform(control.deviceId);

    if (platform) {
      const provider = this.providers.get(platform);
      if (provider) {
        return provider.controlDevice(userId, { ...control, deviceId: nativeId });
      }
    }

    // 无前缀或未知平台 —— 顺序尝试所有 Provider
    for (const provider of this.providers.values()) {
      const ok = await provider.controlDevice(userId, control);
      if (ok) return true;
    }
    return false;
  }

  /**
   * 查询单个设备的当前状态。
   *
   * 聚合所有已绑定平台的设备列表后按 deviceId 过滤，返回该设备的
   * 统一模型快照（含在线状态、运行状态与原始属性）。找不到时返回 null。
   */
  async getDeviceStatus(userId: string, deviceId: string): Promise<IoTDevice | null> {
    const devices = await this.listAllDevices(userId);
    return devices.find((d) => d.id === deviceId) ?? null;
  }

  // ============================================================
  // 平台凭证管理
  // ============================================================

  /**
   * 绑定平台 —— 保存凭证到 IoTCredential 表（upsert）。
   * - 米家：accessToken / refreshToken 写入对应列。
   * - HomeKit：homebridgeUrl / authToken 写入 metadata。
   */
  async bindPlatform(
    userId: string,
    platform: IoTPlatform,
    credentials: PlatformCredentials,
  ): Promise<void> {
    if (platform === 'mihome') {
      await this.prisma.ioTCredential.upsert({
        where: { userId_platform: { userId, platform } },
        create: {
          userId,
          platform,
          accessToken: credentials.accessToken ?? null,
          refreshToken: credentials.refreshToken ?? null,
          expiresAt: null,
        },
        update: {
          accessToken: credentials.accessToken ?? null,
          refreshToken: credentials.refreshToken ?? null,
          expiresAt: null,
        },
      });
      return;
    }

    if (platform === 'homekit') {
      const metadata: Record<string, unknown> = {};
      if (credentials.homebridgeUrl) metadata.homebridgeUrl = credentials.homebridgeUrl;
      if (credentials.authToken) metadata.authToken = credentials.authToken;

      await this.prisma.ioTCredential.upsert({
        where: { userId_platform: { userId, platform } },
        create: {
          userId,
          platform,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          metadata: metadata as Prisma.InputJsonValue,
        },
        update: {
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
      return;
    }

    this.logger.warn(`未知平台绑定请求：${platform}`);
  }

  /** 解绑平台 —— 删除凭证记录 */
  async unbindPlatform(userId: string, platform: IoTPlatform): Promise<void> {
    await this.prisma.ioTCredential.deleteMany({
      where: { userId, platform },
    });
  }

  /** 查询用户已绑定的平台列表 */
  async getBindings(userId: string): Promise<PlatformBinding[]> {
    const credentials = await this.prisma.ioTCredential.findMany({
      where: { userId },
    });

    const boundPlatforms = new Set(credentials.map((c) => c.platform as IoTPlatform));

    const all: PlatformBinding[] = [];
    for (const platform of this.providers.keys()) {
      if (platform === 'mock') {
        all.push({
          platform: 'mock',
          bound: true,
          updatedAt: new Date(),
        });
        continue;
      }
      const credential = credentials.find((c) => c.platform === platform);
      all.push({
        platform,
        bound: boundPlatforms.has(platform),
        expiresAt: credential?.expiresAt ?? undefined,
        updatedAt: credential?.updatedAt ?? new Date(),
      });
    }
    return all;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 解析设备 ID 中的平台前缀。
   * @returns 平台标识与本平台内 ID；无前缀时 platform 为 null
   */
  private parsePlatform(deviceId: string): {
    platform: IoTPlatform | null;
    nativeId: string;
  } {
    const idx = deviceId.indexOf(':');
    if (idx === -1) return { platform: null, nativeId: deviceId };

    const prefix = deviceId.slice(0, idx);
    const nativeId = deviceId.slice(idx + 1);
    if (prefix === 'mihome' || prefix === 'homekit' || prefix === 'mock') {
      return { platform: prefix, nativeId };
    }
    return { platform: null, nativeId: deviceId };
  }
}
