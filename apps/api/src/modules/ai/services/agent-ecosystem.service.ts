import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

// ============================================================
// Public Types
// ============================================================

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'resting';

export type ActivityType = 'info' | 'success' | 'warning' | 'error';

export interface AgentStats {
  /** Cumulative number of memories processed / created by this agent. */
  memories: number;
  /** Cumulative estimated tokens consumed. */
  tokens: number;
  /** Success rate as a percentage (0–100). */
  successRate: number;
  /** Latency of the most recent run in milliseconds. */
  lastLatencyMs: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  avatar: string;
  color: string;
  status: AgentStatus;
  currentActivity: string;
  lastRunAt: Date | null;
  stats: AgentStats;
}

export interface AgentActivity {
  agentId: string;
  agentName: string;
  avatar: string;
  message: string;
  type: ActivityType;
  timestamp: string;
}

export interface ActivityQueryOptions {
  /** Only return activities at or after this time. */
  since?: Date;
  /** Only return activities at or before this time. */
  until?: Date;
  /** Maximum number of activities to return. */
  limit?: number;
}

// ============================================================
// Internal Types
// ============================================================

interface AgentConfig {
  id: string;
  name: string;
  avatar: string;
  color: string;
  description: string;
}

interface ActivityEntry {
  message: string;
  type: ActivityType;
}

/** Result returned by each agent's simulation step. */
interface AgentRunResult {
  /** Number of memories created/organised during this run. */
  memoriesCreated: number;
  /** Estimated tokens consumed during this run. */
  tokensUsed: number;
  /** Activities to record for this run. */
  activities: ActivityEntry[];
}

/** Internal run-level statistics used to compute successRate. */
interface RunStats {
  total: number;
  success: number;
}

/**
 * AgentEcosystemService
 *
 * Runs six background agents that continuously work to enrich the user's
 * digital life. Each agent runs on a @Cron schedule, is fully non-blocking
 * (errors are logged but never crash the process), and records human-readable
 * activity messages to Redis so they can be surfaced on a dashboard.
 *
 * The agents (cron expression shown without the leading step value):
 *  1. Memory Gardener       — every  5 min
 *  2. Relationship Observer — every 10 min
 *  3. Story Weaver          — every 30 min
 *  4. Emotion Guardian      — every  5 min
 *  5. Knowledge Root        — every 15 min
 *  6. Future Planner        — every 30 min
 *
 * Real LLM integration will replace the mock simulation methods later.
 */
@Injectable()
export class AgentEcosystemService {
  private readonly logger = new Logger(AgentEcosystemService.name);

  // Redis configuration for the activity stream.
  private readonly REDIS_KEY_PREFIX = 'agent:activity:';
  private readonly MAX_ACTIVITIES = 20;
  private readonly TTL_SECONDS = 24 * 60 * 60; // 24 hours

  // Runtime state kept in memory for fast access.
  private readonly agentStates = new Map<string, AgentInfo>();
  private readonly runStats = new Map<string, RunStats>();

  // Static agent definitions (id, name, avatar, color, description).
  // Colors reference the design-system CSS custom properties so the dashboard
  // stays consistent with the iOS 27 liquid-glass theme.
  private readonly agents: AgentConfig[] = [
    {
      id: 'memory-gardener',
      name: '记忆园丁',
      avatar: '🌱',
      color: 'var(--color-success)',
      description: '扫描近期对话，提取并整理记忆，修剪重复项',
    },
    {
      id: 'relationship-observer',
      name: '关系观察者',
      avatar: '👀',
      color: 'var(--color-secondary)',
      description: '分析家庭成员互动模式，感知亲密关系变化',
    },
    {
      id: 'story-weaver',
      name: '故事编织者',
      avatar: '🧵',
      color: 'var(--color-purple)',
      description: '从记忆中编织家庭故事，生成时间线条目',
    },
    {
      id: 'emotion-guardian',
      name: '情绪守护者',
      avatar: '🛡️',
      color: 'var(--color-highlight)',
      description: '检查情绪趋势，生成关怀提醒',
    },
    {
      id: 'knowledge-root',
      name: '知识根系',
      avatar: '🌳',
      color: 'var(--color-cyan)',
      description: '构建知识图谱，创建实体连接',
    },
    {
      id: 'future-planner',
      name: '未来规划师',
      avatar: '🔮',
      color: 'var(--color-rose)',
      description: '预测成长方向，生成个性化推荐',
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.initializeAgentStates();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Initialises the in-memory state for every agent with sensible defaults.
   */
  private initializeAgentStates(): void {
    for (const agent of this.agents) {
      this.agentStates.set(agent.id, {
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        color: agent.color,
        status: 'idle',
        currentActivity: '等待启动…',
        lastRunAt: null,
        stats: {
          memories: 0,
          tokens: 0,
          successRate: 100,
          lastLatencyMs: 0,
        },
      });
      this.runStats.set(agent.id, { total: 0, success: 0 });
    }
  }

  // ============================================================
  // Scheduled Agent Runs (@Cron)
  // ============================================================

  /** Memory Gardener — runs every 5 minutes. */
  @Cron('*/5 * * * *')
  async runMemoryGardener(): Promise<void> {
    await this.runAgent('memory-gardener', () => this.simulateMemoryGardener());
  }

  /** Relationship Observer — runs every 10 minutes. */
  @Cron('*/10 * * * *')
  async runRelationshipObserver(): Promise<void> {
    await this.runAgent(
      'relationship-observer',
      () => this.simulateRelationshipObserver(),
    );
  }

  /** Story Weaver — runs every 30 minutes. */
  @Cron('*/30 * * * *')
  async runStoryWeaver(): Promise<void> {
    await this.runAgent('story-weaver', () => this.simulateStoryWeaver());
  }

  /** Emotion Guardian — runs every 5 minutes. */
  @Cron('*/5 * * * *')
  async runEmotionGuardian(): Promise<void> {
    await this.runAgent('emotion-guardian', () => this.simulateEmotionGuardian());
  }

  /** Knowledge Root — runs every 15 minutes. */
  @Cron('*/15 * * * *')
  async runKnowledgeRoot(): Promise<void> {
    await this.runAgent('knowledge-root', () => this.simulateKnowledgeRoot());
  }

  /** Future Planner — runs every 30 minutes. */
  @Cron('*/30 * * * *')
  async runFuturePlanner(): Promise<void> {
    await this.runAgent('future-planner', () => this.simulateFuturePlanner());
  }

  // ============================================================
  // Heartbeat (@Interval)
  // ============================================================

  /**
   * Heartbeat that runs every 60 seconds. It transitions idle agents that
   * have been quiet into a "resting" state so the dashboard reflects that
   * the agent is alive but not actively processing.
   */
  @Interval(60000)
  async heartbeat(): Promise<void> {
    const now = Date.now();
    for (const [agentId, agent] of this.agentStates) {
      if (agent.status === 'working' || agent.status === 'thinking') {
        continue;
      }
      // If the agent hasn't run in the last 2 minutes, mark it as resting.
      if (agent.lastRunAt) {
        const idleMs = now - agent.lastRunAt.getTime();
        if (idleMs > 120_000 && agent.status !== 'resting') {
          agent.status = 'resting';
          agent.currentActivity = '休眠待命…';
        }
      }
    }
  }

  // ============================================================
  // Core Run Logic
  // ============================================================

  /**
   * Executes a single agent run. This wrapper:
   *  - Guards against concurrent runs of the same agent.
   *  - Updates status / currentActivity throughout the lifecycle.
   *  - Captures all errors so a failure never crashes the process.
   *  - Persists activities to Redis and updates stats.
   *
   * @param agentId   - The agent to run.
   * @param simulate  - The agent-specific simulation producing a run result.
   */
  private async runAgent(
    agentId: string,
    simulate: () => Promise<AgentRunResult>,
  ): Promise<void> {
    const agent = this.agentStates.get(agentId);
    if (!agent) {
      this.logger.warn(`Unknown agent: ${agentId}`);
      return;
    }

    // Skip if the agent is already running (re-entrancy guard).
    if (agent.status === 'working') {
      this.logger.debug(`Agent "${agent.name}" is already running, skipping`);
      return;
    }

    const startTime = Date.now();
    this.setAgentStatus(agentId, 'thinking', '正在思考…');
    let success = false;

    try {
      const result = await simulate();
      success = true;

      const latencyMs = Date.now() - startTime;

      // Update runtime stats.
      agent.stats.lastLatencyMs = latencyMs;
      agent.stats.memories += result.memoriesCreated;
      agent.stats.tokens += result.tokensUsed;

      // Record every activity entry to Redis.
      for (const activity of result.activities) {
        await this.recordActivity(agentId, activity.message, activity.type);
      }

      agent.lastRunAt = new Date();
      this.setAgentStatus(agentId, 'idle', '运行完成，待命中');
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Agent "${agent.name}" run failed: ${message}`,
        (error as Error).stack,
      );
      await this.recordActivity(agentId, `运行失败: ${message}`, 'error');
      agent.lastRunAt = new Date();
      this.setAgentStatus(agentId, 'idle', '运行异常，已恢复');
    } finally {
      // Recompute success rate.
      const stats = this.runStats.get(agentId) ?? { total: 0, success: 0 };
      stats.total += 1;
      if (success) stats.success += 1;
      this.runStats.set(agentId, stats);
      agent.stats.successRate = Math.round((stats.success / stats.total) * 100);
    }
  }

  /**
   * Manually triggers an agent run. The run itself is non-blocking — this
   * method awaits the simulation so the caller gets up-to-date state.
   */
  async triggerRun(agentId: string): Promise<AgentInfo> {
    const agent = this.agentStates.get(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    const simulations = this.getSimulations();
    const simulate = simulations[agentId];
    if (!simulate) {
      throw new NotFoundException(`Agent has no simulation: ${agentId}`);
    }

    await this.runAgent(agentId, simulate);
    return agent;
  }

  // ============================================================
  // Agent Simulations (mock data — real LLM integration TBD)
  // ============================================================

  /**
   * Memory Gardener: scans recent conversations, extracts and organises
   * memories, prunes duplicates.
   */
  private async simulateMemoryGardener(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    const newMemories = this.randomInt(8, 42);
    activities.push({
      message: `正在整理 ${newMemories} 条新记忆…`,
      type: 'info',
    });

    await this.delay(this.randomInt(150, 600));

    const duplicates = this.randomInt(0, 6);
    if (duplicates > 0) {
      activities.push({
        message: `去重完成，移除 ${duplicates} 条重复记忆`,
        type: 'success',
      });
    }

    await this.delay(this.randomInt(100, 400));

    const tagged = this.randomInt(3, 18);
    activities.push({
      message: `记忆标签优化完成，更新 ${tagged} 条标签`,
      type: 'success',
    });

    const organised = newMemories - duplicates;
    activities.push({
      message: `本轮整理完成：新增 ${organised} 条有效记忆`,
      type: 'success',
    });

    return {
      memoriesCreated: organised,
      tokensUsed: this.randomInt(300, 1200),
      activities,
    };
  }

  /**
   * Relationship Observer: analyses family member interaction patterns,
   * detects intimacy changes.
   */
  private async simulateRelationshipObserver(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    activities.push({
      message: '正在分析家庭关系变化…',
      type: 'info',
    });

    await this.delay(this.randomInt(200, 700));

    const members = this.randomInt(2, 6);
    activities.push({
      message: `扫描 ${members} 位家庭成员的互动模式`,
      type: 'info',
    });

    await this.delay(this.randomInt(150, 500));

    const delta = this.randomInt(-5, 12);
    if (delta > 0) {
      const relation = this.pick(['父子', '母女', '夫妻', '兄弟', '祖孙']);
      activities.push({
        message: `检测到${relation}亲密度提升 ${delta}%`,
        type: 'success',
      });
    } else if (delta < 0) {
      const relation = this.pick(['父子', '母女', '夫妻', '兄弟', '祖孙']);
      activities.push({
        message: `检测到${relation}亲密度下降 ${Math.abs(delta)}%，已记录`,
        type: 'warning',
      });
    }

    const insights = this.randomInt(0, 3);
    if (insights > 0) {
      activities.push({
        message: `新增 ${insights} 条关系洞察`,
        type: 'success',
      });
    }

    activities.push({
      message: '关系分析完成',
      type: 'success',
    });

    return {
      memoriesCreated: insights,
      tokensUsed: this.randomInt(400, 1500),
      activities,
    };
  }

  /**
   * Story Weaver: generates family stories from memories, creates
   * timeline entries.
   */
  private async simulateStoryWeaver(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    activities.push({
      message: '正在编织本周家庭故事…',
      type: 'info',
    });

    await this.delay(this.randomInt(300, 900));

    const timelines = this.randomInt(2, 6);
    activities.push({
      message: `生成时间线条目 ${timelines} 条`,
      type: 'success',
    });

    await this.delay(this.randomInt(200, 600));

    const storyTitle = this.pick([
      '《夏日露营》',
      '《周末早餐》',
      '《第一次骑单车》',
      '《外婆的生日》',
      '《阳台上的小番茄》',
      '《雨后散步》',
    ]);
    activities.push({
      message: `故事${storyTitle}创作完成`,
      type: 'success',
    });

    return {
      memoriesCreated: timelines,
      tokensUsed: this.randomInt(800, 2500),
      activities,
    };
  }

  /**
   * Emotion Guardian: checks emotion trends, generates caring reminders.
   */
  private async simulateEmotionGuardian(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    const mood = this.pick(['平稳', '波动', '低落', '愉悦', '焦虑']);
    if (mood === '波动' || mood === '低落' || mood === '焦虑') {
      activities.push({
        message: '检测到妈妈近期情绪波动，建议给予更多陪伴',
        type: 'warning',
      });
    } else {
      activities.push({
        message: `近期家庭整体情绪${mood}`,
        type: 'info',
      });
    }

    await this.delay(this.randomInt(150, 500));

    const reminders = this.randomInt(0, 2);
    if (reminders > 0) {
      activities.push({
        message: `生成 ${reminders} 条关怀提醒`,
        type: 'success',
      });
    } else {
      activities.push({
        message: '情绪平稳，无需预警',
        type: 'success',
      });
    }

    return {
      memoriesCreated: reminders,
      tokensUsed: this.randomInt(200, 800),
      activities,
    };
  }

  /**
   * Knowledge Root: builds knowledge graph, creates entity connections.
   */
  private async simulateKnowledgeRoot(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    const nodes = this.randomInt(5, 20);
    activities.push({
      message: `新增 ${nodes} 个知识节点…`,
      type: 'info',
    });

    await this.delay(this.randomInt(200, 600));

    const edges = this.randomInt(8, 35);
    activities.push({
      message: `建立 ${edges} 条实体连接`,
      type: 'success',
    });

    await this.delay(this.randomInt(100, 400));

    activities.push({
      message: '知识图谱更新完成',
      type: 'success',
    });

    return {
      memoriesCreated: nodes,
      tokensUsed: this.randomInt(400, 1400),
      activities,
    };
  }

  /**
   * Future Planner: predicts growth directions, suggests recommendations.
   */
  private async simulateFuturePlanner(): Promise<AgentRunResult> {
    const activities: ActivityEntry[] = [];

    activities.push({
      message: '分析成长趋势…',
      type: 'info',
    });

    await this.delay(this.randomInt(300, 800));

    const trends = this.randomInt(2, 5);
    activities.push({
      message: `识别 ${trends} 条成长趋势`,
      type: 'info',
    });

    await this.delay(this.randomInt(200, 500));

    const recommendations = this.randomInt(2, 6);
    activities.push({
      message: `生成 ${recommendations} 条个性化推荐`,
      type: 'success',
    });

    const area = this.pick(['阅读习惯', '运动健康', '亲子沟通', '兴趣培养', '时间管理']);
    activities.push({
      message: `建议关注「${area}」方向的成长机会`,
      type: 'success',
    });

    return {
      memoriesCreated: recommendations,
      tokensUsed: this.randomInt(600, 2000),
      activities,
    };
  }

  // ============================================================
  // Public Query API
  // ============================================================

  /**
   * Returns the current status of all six agents.
   */
  getAgentStatuses(): AgentInfo[] {
    return this.agents.map((a) => this.agentStates.get(a.id)!).filter(Boolean);
  }

  /**
   * Returns a single agent by id, or undefined if not found.
   */
  getAgentById(agentId: string): AgentInfo | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * Returns activities for one or all agents, optionally filtered by time
   * range and limited.
   *
   * @param agentId  - When provided, only activities for this agent are
   *                   returned. When omitted, activities from all agents are
   *                   merged.
   * @param options  - Time-range filter (since/until) and result limit.
   */
  async getAgentActivities(
    agentId?: string,
    options?: ActivityQueryOptions,
  ): Promise<AgentActivity[]> {
    const agentIds = agentId
      ? [agentId]
      : this.agents.map((a) => a.id);

    const limit = options?.limit ?? 20;
    const since = options?.since;
    const until = options?.until;

    const collected: AgentActivity[] = [];
    const client = this.redis.getClient;

    for (const id of agentIds) {
      try {
        const key = `${this.REDIS_KEY_PREFIX}${id}`;
        const raw = await client.lrange(key, 0, -1);
        for (const item of raw) {
          try {
            const activity = JSON.parse(item) as AgentActivity;
            const ts = new Date(activity.timestamp);
            if (since && ts < since) continue;
            if (until && ts > until) continue;
            collected.push(activity);
          } catch {
            // Skip malformed entries silently.
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to read activities for "${id}": ${(error as Error).message}`,
        );
      }
    }

    // Sort newest first.
    collected.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return collected.slice(0, limit);
  }

  /**
   * Convenience method: returns recent activities from all agents within the
   * last 24 hours (capped at `limit`, default 50).
   */
  async getRecentActivities(limit = 50): Promise<AgentActivity[]> {
    const since = new Date(Date.now() - this.TTL_SECONDS * 1000);
    return this.getAgentActivities(undefined, { since, limit });
  }

  // ============================================================
  // Redis Activity Persistence
  // ============================================================

  /**
   * Pushes a single activity entry to the front of the agent's Redis list,
   * trims the list to MAX_ACTIVITIES items, and refreshes the 24h TTL.
   */
  private async recordActivity(
    agentId: string,
    message: string,
    type: ActivityType,
  ): Promise<void> {
    const config = this.agents.find((a) => a.id === agentId);
    if (!config) return;

    const activity: AgentActivity = {
      agentId,
      agentName: config.name,
      avatar: config.avatar,
      message,
      type,
      timestamp: new Date().toISOString(),
    };

    try {
      const key = `${this.REDIS_KEY_PREFIX}${agentId}`;
      const client = this.redis.getClient;
      await client.lpush(key, JSON.stringify(activity));
      await client.ltrim(key, 0, this.MAX_ACTIVITIES - 1);
      await client.expire(key, this.TTL_SECONDS);
    } catch (error) {
      // Non-blocking: a Redis failure must not crash the agent loop.
      this.logger.warn(
        `Failed to persist activity for "${agentId}": ${(error as Error).message}`,
      );
    }
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Updates an agent's status and current activity string in one place.
   */
  private setAgentStatus(
    agentId: string,
    status: AgentStatus,
    currentActivity: string,
  ): void {
    const agent = this.agentStates.get(agentId);
    if (!agent) return;
    agent.status = status;
    agent.currentActivity = currentActivity;
  }

  /**
   * Returns a lookup table of agentId → simulation function. Centralised so
   * that both @Cron methods and the manual trigger use the same code path.
   */
  private getSimulations(): Record<string, () => Promise<AgentRunResult>> {
    return {
      'memory-gardener': () => this.simulateMemoryGardener(),
      'relationship-observer': () => this.simulateRelationshipObserver(),
      'story-weaver': () => this.simulateStoryWeaver(),
      'emotion-guardian': () => this.simulateEmotionGuardian(),
      'knowledge-root': () => this.simulateKnowledgeRoot(),
      'future-planner': () => this.simulateFuturePlanner(),
    };
  }

  /** Returns a random integer in the inclusive range [min, max]. */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Returns a random element from the given array. */
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Resolves after `ms` milliseconds — simulates async agent work. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
