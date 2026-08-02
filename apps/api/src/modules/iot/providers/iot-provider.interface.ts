import type { IoTDevice, DeviceControl, IoTPlatform } from '../types/iot.types';

/**
 * IoT 平台 Provider 抽象接口。
 *
 * 每个智能硬件平台（米家 / HomeKit）实现该接口，向 IoTService 提供统一的
 * 设备列举、控制与状态查询能力。上层服务只依赖本接口，不感知平台差异。
 */
export interface IoTProviderInterface {
  /** 平台标识 */
  readonly platform: IoTPlatform;

  /**
   * 列举用户在该平台下的所有设备，映射为统一 IoTDevice 模型。
   * 若凭证不存在或已过期，返回空数组（不抛异常）。
   */
  listDevices(userId: string): Promise<IoTDevice[]>;

  /**
   * 向指定设备下发控制指令。
   * @returns 控制是否成功
   */
  controlDevice(userId: string, control: DeviceControl): Promise<boolean>;

  /**
   * 查询单个设备的最新状态。
   * @returns 设备信息，若不存在或不可达返回 null
   */
  getDeviceStatus(userId: string, deviceId: string): Promise<IoTDevice | null>;

  /**
   * 判断该平台对当前用户是否可用（凭证存在且未过期）。
   */
  isAvailable(userId: string): Promise<boolean>;
}
