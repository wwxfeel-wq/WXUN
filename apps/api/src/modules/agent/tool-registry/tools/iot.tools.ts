import { Injectable, Logger } from '@nestjs/common';
import { IoTService } from '../../../iot/iot.service';
import type {
  DeviceAction,
  DeviceControl,
  IoTDevice,
} from '../../../iot/types/iot.types';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/** 设备类型 / 状态中文名，用于生成可读摘要 */
const DEVICE_TYPE_LABELS: Record<string, string> = {
  light: '灯光',
  ac: '空调',
  robot: '机器人',
  vacuum: '扫地机',
  sensor: '传感器',
  switch: '开关',
  curtain: '窗帘',
  air_purifier: '空气净化器',
};

const DEVICE_STATUS_LABELS: Record<string, string> = {
  on: '开启',
  off: '关闭',
  running: '运行中',
  idle: '待机',
  charging: '充电中',
};

/** control_device 允许的动作 */
const ALLOWED_ACTIONS: DeviceAction[] = ['turn_on', 'turn_off', 'set_property'];

/**
 * IoT MCP 工具集。
 *
 * 让 Agent 能够查询与控制用户的智能硬件：
 * - list_iot_devices：列举所有已绑定平台的设备
 * - control_device：对指定设备下发控制指令
 * - get_device_status：查询单个设备的当前状态
 *
 * 所有工具通过 IoTService 操作，设备 ID 采用
 * `${platform}:${nativeId}` 编码，控制时自动路由到对应平台。
 */
@Injectable()
export class IoTTools {
  private readonly logger = new Logger(IoTTools.name);

  constructor(
    private readonly iotService: IoTService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      this.listIotDevices(),
      this.controlDevice(),
      this.getDeviceStatus(),
    ];
  }

  // ============================================================
  // list_iot_devices —— 列举所有 IoT 设备
  // ============================================================

  private listIotDevices(): McpToolDefinition {
    return {
      name: 'list_iot_devices',
      description: '列举用户所有已绑定平台（米家 / HomeKit）的智能设备列表',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (_args, ctx) => this.handleListIotDevices(ctx),
    };
  }

  private async handleListIotDevices(ctx: McpToolContext): Promise<McpToolResult> {
    try {
      const devices = await this.iotService.listAllDevices(ctx.userId);

      if (devices.length === 0) {
        return {
          tool: 'list_iot_devices',
          success: true,
          summary: '暂无已绑定的智能设备',
          data: { devices: [] },
        };
      }

      const summary = devices
        .map((d) => {
          const typeLabel = DEVICE_TYPE_LABELS[d.type] ?? d.type;
          const statusLabel = DEVICE_STATUS_LABELS[d.status] ?? d.status;
          const onlineTag = d.online ? '' : '（离线）';
          return `- ${d.name}（${typeLabel}，${d.room}）：${statusLabel}${onlineTag} [${d.id}]`;
        })
        .join('\n');

      return {
        tool: 'list_iot_devices',
        success: true,
        summary: `共 ${devices.length} 台设备：\n${summary}`,
        data: { devices },
      };
    } catch (error) {
      this.logger.warn(`list_iot_devices 失败：${(error as Error).message}`);
      return {
        tool: 'list_iot_devices',
        success: false,
        summary: `设备列表获取失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // control_device —— 控制指定设备
  // ============================================================

  private controlDevice(): McpToolDefinition {
    return {
      name: 'control_device',
      description: '对指定智能设备下发控制指令（开 / 关 / 设置属性）',
      parameters: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '目标设备 ID（与 list_iot_devices 返回的 id 一致，格式为 platform:nativeId）',
          },
          action: {
            type: 'string',
            description: '控制动作：turn_on（开启）/ turn_off（关闭）/ set_property（设置属性）',
            enum: ALLOWED_ACTIONS,
          },
          property: {
            type: 'string',
            description: 'set_property 动作时指定的属性名（如 brightness / temperature / mode）',
          },
          value: {
            type: 'string',
            description: 'set_property 动作时设定的属性值',
          },
        },
        required: ['deviceId', 'action'],
      },
      handler: async (args, ctx) => this.handleControlDevice(args, ctx),
    };
  }

  private async handleControlDevice(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const deviceId = String(args.deviceId ?? '').trim();
    const action = String(args.action ?? '').trim() as DeviceAction;

    if (!deviceId) {
      return {
        tool: 'control_device',
        success: false,
        summary: '请提供目标设备 ID',
      };
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return {
        tool: 'control_device',
        success: false,
        summary: `不支持的动作：${action}（可选 turn_on / turn_off / set_property）`,
      };
    }

    const control: DeviceControl = { deviceId, action };
    if (typeof args.property === 'string' && args.property.trim()) {
      control.property = args.property.trim();
    }
    if (args.value !== undefined && args.value !== null) {
      control.value = args.value;
    }

    // set_property 必须提供 property
    if (action === 'set_property' && !control.property) {
      return {
        tool: 'control_device',
        success: false,
        summary: 'set_property 动作需要提供 property 参数',
      };
    }

    try {
      const ok = await this.iotService.controlDevice(ctx.userId, control);
      const actionLabel =
        action === 'turn_on' ? '开启' : action === 'turn_off' ? '关闭' : `设置 ${control.property}`;
      if (ok) {
        return {
          tool: 'control_device',
          success: true,
          summary: `已对设备 ${deviceId} 下发${actionLabel}指令`,
          data: { deviceId, action, property: control.property, value: control.value },
        };
      }
      return {
        tool: 'control_device',
        success: false,
        summary: `设备 ${deviceId} 控制指令未生效，可能设备离线或不支持该操作`,
      };
    } catch (error) {
      this.logger.warn(`control_device 失败 (${deviceId})：${(error as Error).message}`);
      return {
        tool: 'control_device',
        success: false,
        summary: `设备控制失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // get_device_status —— 查询单个设备状态
  // ============================================================

  private getDeviceStatus(): McpToolDefinition {
    return {
      name: 'get_device_status',
      description: '查询单个智能设备的当前状态（在线状态、运行状态与属性）',
      parameters: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '目标设备 ID（格式为 platform:nativeId）',
          },
        },
        required: ['deviceId'],
      },
      handler: async (args, ctx) => this.handleGetDeviceStatus(args, ctx),
    };
  }

  private async handleGetDeviceStatus(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const deviceId = String(args.deviceId ?? '').trim();
    if (!deviceId) {
      return {
        tool: 'get_device_status',
        success: false,
        summary: '请提供目标设备 ID',
      };
    }

    try {
      const device = await this.iotService.getDeviceStatus(ctx.userId, deviceId);
      if (!device) {
        return {
          tool: 'get_device_status',
          success: false,
          summary: `未找到设备 ${deviceId}，可能未绑定或不属于当前用户`,
        };
      }

      const summary = this.formatDeviceStatus(device);
      return {
        tool: 'get_device_status',
        success: true,
        summary,
        data: device,
      };
    } catch (error) {
      this.logger.warn(`get_device_status 失败 (${deviceId})：${(error as Error).message}`);
      return {
        tool: 'get_device_status',
        success: false,
        summary: `设备状态查询失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /** 将单台设备状态格式化为可读摘要 */
  private formatDeviceStatus(device: IoTDevice): string {
    const typeLabel = DEVICE_TYPE_LABELS[device.type] ?? device.type;
    const statusLabel = DEVICE_STATUS_LABELS[device.status] ?? device.status;
    const onlineTag = device.online ? '在线' : '离线';

    const propEntries = Object.entries(device.properties ?? {});
    const propDesc =
      propEntries.length > 0
        ? propEntries.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('，')
        : '无';

    return `${device.name}（${typeLabel}，${device.room}）：${onlineTag}，${statusLabel}。属性：${propDesc}`;
  }
}
