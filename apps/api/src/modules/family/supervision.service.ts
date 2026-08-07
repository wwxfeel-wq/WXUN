import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IoTService } from '../iot/iot.service';
import { MockProvider } from '../iot/providers/mock.provider';
import type { IoTDevice } from '../iot/types/iot.types';

// ============================================================
// 类型定义
// ============================================================

/** 家庭成员角色 */
export type FamilyRole = 'father' | 'mother' | 'grandparent' | 'child' | 'other';

/** 督促任务类型 */
export type SupervisionType =
  | 'medication_reminder' // 吃药提醒
  | 'homework_reminder' // 作业提醒
  | 'grocery_reminder' // 买菜提醒
  | 'safety_check' // 安全检查
  | 'health_check' // 健康检查
  | 'schedule_reminder'; // 日程提醒

/** 督促任务优先级 */
export type SupervisionPriority = 'high' | 'medium' | 'low';

/** 督促任务状态 */
export type SupervisionStatus = 'active' | 'resolved' | 'snoozed';

/** 家庭成员信息 */
export interface FamilyMemberInfo {
  name: string;
  role: FamilyRole;
  avatar: string;
}

/** 督促任务 */
export interface SupervisionTask {
  id: string;
  familyMember: FamilyMemberInfo;
  type: SupervisionType;
  title: string;
  description: string;
  priority: SupervisionPriority;
  status: SupervisionStatus;
  sourceDevice: string;
  suggestedAction: string;
  createdAt: Date;
  dueAt: Date;
}

// ============================================================
// Mock 家庭成员数据（内存维护，不需要数据库）
// ============================================================

/** 演示用家庭成员列表 */
const MOCK_FAMILY_MEMBERS: FamilyMemberInfo[] = [
  { name: '爷爷', role: 'grandparent', avatar: '👴' },
  { name: '奶奶', role: 'grandparent', avatar: '👵' },
  { name: '爸爸', role: 'father', avatar: '👨' },
  { name: '妈妈', role: 'mother', avatar: '👩' },
  { name: '小明', role: 'child', avatar: '👦' },
];

/**
 * SupervisionService — 家长督促提醒服务。
 *
 * 时墨以"家长"身份督促家庭成员完成日常事务。根据 IoT 设备状态和时间段，
 * 自动生成吃药提醒、买菜提醒、安全检查、日程提醒等督促任务。
 * 所有任务在内存中维护，不需要数据库迁移。
 */
@Injectable()
export class SupervisionService {
  private readonly logger = new Logger(SupervisionService.name);

  /** 内存中的督促任务，外层 key 为 userId，内层 key 为 taskId */
  private readonly taskStore: Map<string, Map<string, SupervisionTask>> = new Map();

  /** 任务 ID 自增计数器 */
  private taskCounter = 0;

  constructor(
    private readonly iotService: IoTService,
    private readonly mockProvider: MockProvider,
  ) {}

  // ============================================================
  // 督促任务生成
  // ============================================================

  /**
   * 根据家庭成员和设备状态生成督促任务。
   *
   * 生成逻辑：
   * 1. 从 IoTService 获取设备状态
   * 2. 从 MockProvider 获取药盒、冰箱、门锁等设备状态
   * 3. 根据设备状态和时间段生成督促任务
   * 4. 跳过已存在的活跃任务（去重）
   */
  async generateSupervisions(userId: string): Promise<SupervisionTask[]> {
    const devices = await this.iotService.listAllDevices(userId);
    const now = new Date();
    const hour = now.getHours();
    const newTasks: SupervisionTask[] = [];

    // --- 规则 1：药盒未按时服药 → medication_reminder ---
    const medicineBox = this.findDevice(devices, 'mock:medicine-box-bedroom');
    if (medicineBox) {
      const nextDose = medicineBox.properties.nextDose as
        | { time: string; medication: string; taken: boolean }
        | undefined;
      if (nextDose && !nextDose.taken) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[0], // 爷爷
          type: 'medication_reminder',
          title: `提醒爷爷吃${nextDose.medication}`,
          description: `爷爷的 ${nextDose.time} ${nextDose.medication}尚未服用，药盒检测到未取药`,
          priority: 'high',
          sourceDevice: medicineBox.id,
          suggestedAction: `请提醒爷爷服用${nextDose.medication}，或者帮他取药`,
          dueMinutes: 30,
        });
        if (task) newTasks.push(task);
      }

      // 如果有漏服记录 → health_check
      const missedDoses = Number(medicineBox.properties.missedDoses ?? 0);
      if (missedDoses > 0) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[0], // 爷爷
          type: 'health_check',
          title: '爷爷用药健康检查',
          description: `药盒记录显示爷爷有 ${missedDoses} 次漏服，建议关注爷爷的用药情况`,
          priority: 'medium',
          sourceDevice: medicineBox.id,
          suggestedAction: '建议检查爷爷的用药计划，必要时联系家庭医生',
          dueMinutes: 120,
        });
        if (task) newTasks.push(task);
      }
    }

    // --- 规则 2：冰箱食材快过期 → grocery_reminder ---
    const fridge = this.findDevice(devices, 'mock:fridge-kitchen');
    if (fridge) {
      const foodItems = fridge.properties.foodItems as
        | Array<{ name: string; expiryDays: number; addedDays: number }>
        | undefined;
      if (foodItems && foodItems.length > 0) {
        const expiringItems = foodItems.filter((item) => item.expiryDays <= 1);
        if (expiringItems.length > 0) {
          const itemNames = expiringItems.map((i) => i.name).join('、');
          const task = this.tryCreateTask(userId, {
            familyMember: MOCK_FAMILY_MEMBERS[2], // 爸爸
            type: 'grocery_reminder',
            title: '提醒爸爸买菜补充食材',
            description: `冰箱中${itemNames}即将过期（${expiringItems.length} 项），建议尽快补充新鲜食材`,
            priority: 'medium',
            sourceDevice: fridge.id,
            suggestedAction: `请提醒爸爸下班顺路买些新鲜食材，替换即将过期的${itemNames}`,
            dueMinutes: 240,
          });
          if (task) newTasks.push(task);
        }
      }
    }

    // --- 规则 3：深夜摄像头检测到移动 → safety_check ---
    const camera = this.findDevice(devices, 'mock:camera-living');
    if (camera) {
      const motionDetected = camera.properties.motionDetected as boolean | undefined;
      const isLateNight = hour >= 22 || hour < 6;
      if (motionDetected && isLateNight) {
        const lastMotionTime = camera.properties.lastMotionTime as string | undefined;
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[2], // 爸爸
          type: 'safety_check',
          title: '深夜异常移动警报',
          description: `客厅摄像头在深夜检测到移动${
            lastMotionTime ? `（最近触发：${lastMotionTime}）` : ''
          }，请确认家中安全`,
          priority: 'high',
          sourceDevice: camera.id,
          suggestedAction: '请立即查看摄像头画面，确认是否有异常情况，必要时联系家人或报警',
          dueMinutes: 15,
        });
        if (task) newTasks.push(task);
      }
    }

    // --- 规则 4：早上 7:00-9:00 孩子未起床 → schedule_reminder ---
    const isMorning = hour >= 7 && hour < 9;
    if (isMorning) {
      const bedroomLight = this.findDevice(devices, 'mock:light-bedroom');
      const childAwake = bedroomLight?.status === 'on';
      if (!childAwake) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[4], // 小明
          type: 'schedule_reminder',
          title: '提醒小明起床准备上学',
          description: '现在是上学时间，小明卧室灯仍未打开，可能还未起床',
          priority: 'medium',
          sourceDevice: 'mock:light-bedroom',
          suggestedAction: '请提醒小明起床洗漱，准备上学，不要迟到',
          dueMinutes: 20,
        });
        if (task) newTasks.push(task);
      }
    }

    // --- 规则 5：傍晚 17:00-19:00 孩子未开始写作业 → homework_reminder ---
    const isEvening = hour >= 17 && hour < 19;
    if (isEvening) {
      const studyLight = this.findDevice(devices, 'mock:light-study');
      const studying = studyLight?.status === 'on';
      if (!studying) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[4], // 小明
          type: 'homework_reminder',
          title: '提醒小明写作业',
          description: '现在是作业时间，书房灯未打开，小明可能还未开始写作业',
          priority: 'medium',
          sourceDevice: 'mock:light-study',
          suggestedAction: '请提醒小明去书房写作业，完成后可以适当休息',
          dueMinutes: 30,
        });
        if (task) newTasks.push(task);
      }
    }

    // --- 规则 6：烟雾报警器触发 → safety_check（紧急） ---
    const smokeAlarm = this.findDevice(devices, 'mock:smoke-alarm-kitchen');
    if (smokeAlarm) {
      const smokeDetected = smokeAlarm.properties.smokeDetected as boolean | undefined;
      if (smokeDetected) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[2], // 爸爸
          type: 'safety_check',
          title: '厨房烟雾警报',
          description: '厨房烟雾报警器已触发，可能存在火灾风险',
          priority: 'high',
          sourceDevice: smokeAlarm.id,
          suggestedAction: '请立即检查厨房情况，确认是否有火灾隐患，必要时拨打119',
          dueMinutes: 5,
        });
        if (task) newTasks.push(task);
      }
    }

    // --- 规则 7：深夜门锁未上锁 → safety_check ---
    const doorLock = this.findDevice(devices, 'mock:door-lock-front');
    if (doorLock) {
      const locked = doorLock.properties.locked as boolean | undefined;
      if (locked === false && (hour >= 22 || hour < 6)) {
        const task = this.tryCreateTask(userId, {
          familyMember: MOCK_FAMILY_MEMBERS[2], // 爸爸
          type: 'safety_check',
          title: '深夜门锁未上锁',
          description: '智能门锁显示当前未上锁，深夜存在安全隐患',
          priority: 'high',
          sourceDevice: doorLock.id,
          suggestedAction: '请提醒家人锁好门，或远程控制门锁上锁',
          dueMinutes: 10,
        });
        if (task) newTasks.push(task);
      }
    }

    if (newTasks.length > 0) {
      this.logger.log(
        `为用户 ${userId} 生成了 ${newTasks.length} 条督促任务：${newTasks.map((t) => t.type).join(', ')}`,
      );
    }

    return newTasks;
  }

  // ============================================================
  // 督促任务查询与管理
  // ============================================================

  /**
   * 获取当前活跃的督促任务。
   * 返回 status 为 active 的任务，按优先级和创建时间排序。
   */
  async getActiveSupervisions(userId: string): Promise<SupervisionTask[]> {
    const userTasks = this.taskStore.get(userId);
    if (!userTasks) return [];

    const priorityOrder: Record<SupervisionPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return Array.from(userTasks.values())
      .filter((t) => t.status === 'active')
      .sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * 标记督促任务已完成。
   * @throws NotFoundException 任务不存在
   */
  async resolveSupervision(userId: string, supervisionId: string): Promise<SupervisionTask> {
    const userTasks = this.taskStore.get(userId);
    if (!userTasks) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '督促任务不存在',
      });
    }

    const task = userTasks.get(supervisionId);
    if (!task) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '督促任务不存在',
      });
    }

    task.status = 'resolved';
    this.logger.log(`督促任务 ${supervisionId}（${task.title}）已被用户 ${userId} 标记为完成`);

    return task;
  }

  /**
   * 获取家庭成员角色列表。
   * 当前使用内存中的 Mock 数据，后续可对接数据库。
   */
  async getFamilyMemberRoles(_familyId: string): Promise<FamilyMemberInfo[]> {
    return MOCK_FAMILY_MEMBERS;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 从设备列表中按 ID 查找设备。
   * 优先从 IoTService 返回的列表中查找，找不到则尝试 MockProvider 的内存引用。
   */
  private findDevice(devices: IoTDevice[], deviceId: string): IoTDevice | undefined {
    const found = devices.find((d) => d.id === deviceId);
    if (found) return found;

    // 降级：直接从 MockProvider 内存中获取
    const ref = this.mockProvider.getDeviceRef(deviceId);
    return ref ?? undefined;
  }

  /**
   * 尝试创建督促任务。如果已存在同类型、同设备的活跃任务则跳略（去重）。
   * @returns 新创建的任务，或 null（已存在重复任务）
   */
  private tryCreateTask(
    userId: string,
    params: {
      familyMember: FamilyMemberInfo;
      type: SupervisionType;
      title: string;
      description: string;
      priority: SupervisionPriority;
      sourceDevice: string;
      suggestedAction: string;
      dueMinutes: number;
    },
  ): SupervisionTask | null {
    const userTasks = this.getOrCreateUserTaskMap(userId);

    // 去重：检查是否已存在同类型、同设备的活跃任务
    const exists = Array.from(userTasks.values()).some(
      (t) =>
        t.type === params.type &&
        t.sourceDevice === params.sourceDevice &&
        t.status === 'active',
    );
    if (exists) return null;

    this.taskCounter++;
    const taskId = `sup-${String(this.taskCounter).padStart(3, '0')}`;
    const now = new Date();

    const task: SupervisionTask = {
      id: taskId,
      familyMember: params.familyMember,
      type: params.type,
      title: params.title,
      description: params.description,
      priority: params.priority,
      status: 'active',
      sourceDevice: params.sourceDevice,
      suggestedAction: params.suggestedAction,
      createdAt: now,
      dueAt: new Date(now.getTime() + params.dueMinutes * 60 * 1000),
    };

    userTasks.set(taskId, task);
    return task;
  }

  /** 获取或创建用户的任务存储 Map */
  private getOrCreateUserTaskMap(userId: string): Map<string, SupervisionTask> {
    let userTasks = this.taskStore.get(userId);
    if (!userTasks) {
      userTasks = new Map();
      this.taskStore.set(userId, userTasks);
    }
    return userTasks;
  }
}
