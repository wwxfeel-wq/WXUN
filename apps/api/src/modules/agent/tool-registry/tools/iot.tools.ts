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
  fridge: '冰箱',
  lock: '门锁',
  alarm: '报警器',
  medical: '药盒',
  camera: '摄像头',
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
 * 支持的设备类型涵盖灯光、空调、扫地机器人、空气净化器、窗帘、传感器、
 * 智能冰箱（食材过期/温度/门状态）、智能门锁（锁定状态/电量）、
 * 智能药盒（服药提醒/漏服记录）、智能摄像头（移动侦测/夜视）等。
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
      this.startVacuumCleaning(),
      this.stopVacuumCleaning(),
      this.getVacuumStatus(),
    ];
  }

  // ============================================================
  // list_iot_devices —— 列举所有 IoT 设备
  // ============================================================

  private listIotDevices(): McpToolDefinition {
    return {
      name: 'list_iot_devices',
      description:
        '列举用户所有智能设备（含内置演示设备：灯光、空调、扫地机器人、空气净化器、窗帘、传感器、智能冰箱、智能门锁、烟雾报警器、智能药盒、智能摄像头等），可用于分析家庭环境和操控设备',
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
      description:
        '对指定智能设备下发控制指令（开/关/设置属性）。支持灯光亮度调节、空调温度设置、扫地机器人启动清扫（mode=start_cleaning）、窗帘位置控制、冰箱温度调节（temperature）、门锁开关（locked）、摄像头录制开关（recording）等',
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
            description:
              'set_property 动作时指定的属性名（brightness 亮度 / temperature 温度 / mode 模式 / position 窗帘位置 / fanSpeed 风速 / locked 门锁开关 / recording 摄像头录制 / doorOpen 冰箱门状态）',
          },
          value: {
            type: 'string',
            description:
              'set_property 动作时设定的属性值（如亮度 0-100、温度数值、扫地机 mode=start_cleaning）',
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
      description:
        '查询单个智能设备的当前状态（在线状态、运行状态与属性）。可用于查询冰箱食材过期情况、门锁锁定与电量状态、药盒服药提醒、摄像头移动侦测与录制状态等',
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
  // start_vacuum_cleaning —— 启动扫地机器人
  // ============================================================

  private startVacuumCleaning(): McpToolDefinition {
    return {
      name: 'start_vacuum_cleaning',
      description:
        '启动扫地机器人清扫任务。支持三种模式：quick（快速清扫，约4分钟完成全屋）/ deep（深度清扫，覆盖更全面）/ spot（重点清扫，针对脏污区域）。用户说"打扫一下"/"清扫客厅"/"帮我拖地"等都可以调用此工具',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            description: '清扫模式：quick（快速）/ deep（深度）/ spot（重点）',
            enum: ['quick', 'deep', 'spot'],
          },
        },
        required: [],
      },
      handler: async (args, _ctx) => this.handleStartVacuum(args),
    };
  }

  private async handleStartVacuum(
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const mode = (String(args.mode ?? 'deep').trim() as 'quick' | 'deep' | 'spot') || 'deep';

    try {
      const route = this.iotService.startVacuumCleaning(mode);

      const roomSequence = route.waypoints
        .filter((w) => w.action === 'enter')
        .map((w) => w.room)
        .join(' → ');

      const durationMin = Math.floor(route.estimatedDurationSec / 60);

      return {
        tool: 'start_vacuum_cleaning',
        success: true,
        summary: `扫地机器人已启动${mode === 'quick' ? '快速' : mode === 'deep' ? '深度' : '重点'}清扫模式。路线：${roomSequence}，面积 ${route.totalArea}㎡，预计 ${durationMin} 分钟完成`,
        data: { mode, route, rooms: roomSequence },
      };
    } catch (error) {
      this.logger.warn(`start_vacuum_cleaning 失败：${(error as Error).message}`);
      return {
        tool: 'start_vacuum_cleaning',
        success: false,
        summary: `扫地机器人启动失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // stop_vacuum_cleaning —— 停止扫地机器人
  // ============================================================

  private stopVacuumCleaning(): McpToolDefinition {
    return {
      name: 'stop_vacuum_cleaning',
      description: '停止扫地机器人当前清扫任务，机器人将返回充电桩',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (_args, _ctx) => this.handleStopVacuum(),
    };
  }

  private async handleStopVacuum(): Promise<McpToolResult> {
    try {
      this.iotService.stopVacuumCleaning();
      return {
        tool: 'stop_vacuum_cleaning',
        success: true,
        summary: '扫地机器人已停止清扫，正在返回充电桩',
      };
    } catch (error) {
      this.logger.warn(`stop_vacuum_cleaning 失败：${(error as Error).message}`);
      return {
        tool: 'stop_vacuum_cleaning',
        success: false,
        summary: `停止失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // get_vacuum_status —— 获取扫地机器人状态
  // ============================================================

  private getVacuumStatus(): McpToolDefinition {
    return {
      name: 'get_vacuum_status',
      description: '查询扫地机器人的实时状态：是否在清扫、当前进度、电量、已清扫面积、事件日志等',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (_args, _ctx) => this.handleGetVacuumStatus(),
    };
  }

  private async handleGetVacuumStatus(): Promise<McpToolResult> {
    try {
      const state = this.iotService.getVacuumStatus();
      const progress = state.route && state.route.waypoints.length > 0
        ? Math.round(((state.currentStep ?? 0) / state.route.waypoints.length) * 100)
        : 0;

      const summary = state.isCleaning
        ? `扫地机器人正在${state.mode === 'quick' ? '快速' : state.mode === 'deep' ? '深度' : '重点'}清扫，进度 ${progress}%，位置：${state.currentRoom ?? '未知'}，电量 ${state.battery}%`
        : `扫地机器人待命中，电量 ${state.battery}%`;

      return {
        tool: 'get_vacuum_status',
        success: true,
        summary,
        data: state,
      };
    } catch (error) {
      this.logger.warn(`get_vacuum_status 失败：${(error as Error).message}`);
      return {
        tool: 'get_vacuum_status',
        success: false,
        summary: `状态查询失败：${(error as Error).message}`,
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
