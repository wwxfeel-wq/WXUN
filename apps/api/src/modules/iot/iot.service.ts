import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionUtil } from '../../common/utils/encryption.util';
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
    private readonly encryption: EncryptionUtil,
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
   * 优先按 deviceId 前缀直接路由到对应 provider 查询，
   * 避免列举全部设备后再过滤的性能开销。
   * 无前缀或未知平台时，回退遍历所有 provider。
   */
  async getDeviceStatus(userId: string, deviceId: string): Promise<IoTDevice | null> {
    const { platform, nativeId } = this.parsePlatform(deviceId);
    if (platform) {
      const provider = this.providers.get(platform);
      if (provider) return provider.getDeviceStatus(userId, nativeId);
    }
    // 回退：遍历所有 provider
    for (const provider of this.providers.values()) {
      const device = await provider.getDeviceStatus(userId, deviceId);
      if (device) return device;
    }
    return null;
  }

  /**
   * 启动扫地机器人清扫（门面方法，委托给 MockProvider）。
   */
  startVacuumCleaning(userId: string, mode: 'quick' | 'deep' | 'spot') {
    const vacuum = this.mockProvider.getDeviceRef(userId, 'mock:robot-vacuum');
    const battery = Number(vacuum?.properties.battery ?? 85);
    return this.mockProvider.startCleaning(userId, mode, battery);
  }

  /**
   * 获取扫地机器人实时状态（门面方法）。
   */
  getVacuumStatus(userId: string) {
    return this.mockProvider.getVacuumState(userId);
  }

  /**
   * 停止扫地机器人清扫（门面方法）。
   */
  stopVacuumCleaning(userId: string) {
    return this.mockProvider.stopCleaning(userId);
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
      const encAccessToken = credentials.accessToken
        ? this.encryption.encrypt(credentials.accessToken)
        : null;
      const encRefreshToken = credentials.refreshToken
        ? this.encryption.encrypt(credentials.refreshToken)
        : null;
      const expiresAt = credentials.expiresInSeconds
        ? new Date(Date.now() + credentials.expiresInSeconds * 1000)
        : null;
      await this.prisma.ioTCredential.upsert({
        where: { userId_platform: { userId, platform } },
        create: {
          userId,
          platform,
          accessToken: encAccessToken,
          refreshToken: encRefreshToken,
          expiresAt,
        },
        update: {
          accessToken: encAccessToken,
          refreshToken: encRefreshToken,
          expiresAt,
        },
      });
      return;
    }

    if (platform === 'homekit') {
      const metadata: Record<string, unknown> = {};
      if (credentials.homebridgeUrl) metadata.homebridgeUrl = credentials.homebridgeUrl;
      if (credentials.authToken) metadata.authToken = this.encryption.encrypt(credentials.authToken);

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

    throw new BadRequestException(`不支持的平台: ${platform}`);
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
   * 使用 indexOf 只分割第一个冒号，避免 nativeId 中包含冒号时被截断。
   * @returns 平台标识与本平台内 ID；无前缀时 platform 为 null
   */
  private parsePlatform(deviceId: string): {
    platform: IoTPlatform | null;
    nativeId: string;
  } {
    const VALID_PLATFORMS: IoTPlatform[] = ['mihome', 'homekit', 'mock'];
    const colonIdx = deviceId.indexOf(':');
    if (colonIdx === -1) return { platform: null, nativeId: deviceId };
    const platform = deviceId.substring(0, colonIdx);
    const nativeId = deviceId.substring(colonIdx + 1);
    if (VALID_PLATFORMS.includes(platform as IoTPlatform)) {
      return { platform: platform as IoTPlatform, nativeId };
    }
    return { platform: null, nativeId: deviceId };
  }
}
