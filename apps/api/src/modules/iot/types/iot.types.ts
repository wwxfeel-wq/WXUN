/**
 * EchoLife IoT Module - Unified Device Model
 *
 * 提供跨平台（米家 / HomeKit）的统一设备模型与控制指令类型。
 * 所有 Provider 实现均向这套统一模型靠拢，上层服务无需感知底层差异。
 */

/** 支持的智能设备类型 */
export type DeviceType =
  | 'light'
  | 'ac'
  | 'robot'
  | 'vacuum'
  | 'sensor'
  | 'switch'
  | 'curtain'
  | 'air_purifier'
  | 'fridge'
  | 'lock'
  | 'alarm'
  | 'medical'
  | 'camera';

/** 设备运行状态 */
export type DeviceStatus =
  | 'on'
  | 'off'
  | 'running'
  | 'idle'
  | 'charging';

/** 已对接的 IoT 平台标识 */
export type IoTPlatform = 'mihome' | 'homekit' | 'mock';

/** 统一设备模型，屏蔽各平台字段差异 */
export interface IoTDevice {
  /** 平台内唯一标识，格式为 `${platform}:${nativeId}` */
  id: string;
  /** 所属平台 */
  platform: IoTPlatform;
  /** 设备名称 */
  name: string;
  /** 所在房间 / 分组 */
  room: string;
  /** 设备类型 */
  type: DeviceType;
  /** 当前状态 */
  status: DeviceStatus;
  /** 平台原始属性（亮度 / 温度 / 模式等），键值由 Provider 填充 */
  properties: Record<string, unknown>;
  /** 设备是否在线 */
  online: boolean;
}

/** 设备控制动作 */
export type DeviceAction = 'turn_on' | 'turn_off' | 'set_property';

/** 统一控制指令 */
export interface DeviceControl {
  /** 目标设备 id（与 IoTDevice.id 对应） */
  deviceId: string;
  /** 控制动作 */
  action: DeviceAction;
  /** set_property 动作时指定的属性名 */
  property?: string;
  /** set_property 动作时设定的属性值 */
  value?: unknown;
}

/** 平台绑定凭证（米家使用 token，HomeKit 使用 homebridgeUrl + authToken） */
export interface PlatformCredentials {
  /** 米家 access token */
  accessToken?: string;
  /** 米家 refresh token */
  refreshToken?: string;
  /** Homebridge REST API 地址 */
  homebridgeUrl?: string;
  /** Homebridge 鉴权 token */
  authToken?: string;
}

/** 已绑定的平台信息 */
export interface PlatformBinding {
  platform: IoTPlatform;
  /** 是否绑定凭证 */
  bound: boolean;
  /** 凭证过期时间（米家 token 可能过期） */
  expiresAt?: Date;
  /** 绑定时间 */
  updatedAt: Date;
}
