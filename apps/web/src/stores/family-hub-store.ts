'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SkillAbility, SkillAbilityResult } from '@echolife/shared';
import { apiClient } from '@/lib/api-client';

/* ═══════════════ Types ═══════════════ */

export interface FamilyMetrics {
  understandingPercent: number;
  treeLevel: number;
  treeStage: string;
  treeGrowth: number; // 0-1
  longTermMemories: number;
  familyMembers: number;
  weeklyGrowthPercent: number;
  aiLevel: number;
  masteredSkills: number;
  activeAgents: number;
  newAbilities: number;
  wechatSync: 'connected' | 'disconnected';
  knowledgeDocs: number;
  growthValue: number;
  timeCapsules: number;
  milestones: number;
  stories: number;
  interviews: number;
  // 童忆引擎指标
  kindnessMemories?: number;
  warmReminders?: number;
  familyStories?: number;
}

export type ShimoStatus =
  | 'online'
  | 'thinking'
  | 'learning'
  | 'updating_memory'
  | 'updating_tree'
  | 'syncing_wechat';

export interface ShimoCore {
  status: ShimoStatus;
  understanding: number;
  /** 时墨自身心情指数（0-100），独立于家庭理解度 */
  mood: number;
  level: number;
  agentCount: number;
  learningCount: number;
  recentLearning: string[];
}

export type AgentStatus = 'running' | 'thinking' | 'idle' | 'syncing' | 'learning' | 'ready';

export interface AgentRuntime {
  id: string;
  name: string;
  role: string;
  description?: string;
  status: AgentStatus;
  level: number;
  lastActive: string;
  calls: number;
  icon: string;
  color?: string;
  capabilities?: string[];
  welcomeMessage?: string;
  skillCount?: number;
}

export interface InvokeSkillAbilityPayload {
  abilityName: string;
  parameters?: Record<string, unknown>;
}

export interface SkillProgress {
  id: string;
  name: string;
  description?: string;
  level: number;
  status: 'mastered' | 'learning' | 'new' | 'updated';
  progress?: number;
  sourceAgent: string;
  sourceAgentCode?: string;
  icon: string;
  color: string;
  category?: string;
  tags?: string[];
  examples?: string[];
  /** Executable abilities exposed by this skill. */
  abilities?: SkillAbility[];
}

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  detail: string;
  type: 'skill' | 'agent' | 'memory' | 'tree' | 'device';
}

export interface DeviceSync {
  id: string;
  name: string;
  status: 'connected' | 'synced' | 'coming_soon' | 'disconnected';
  icon: string;
}

export interface FamilyStatusItem {
  id: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: string;
}

export interface MCPToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  status: 'idle' | 'calling' | 'success' | 'error';
  timestamp: number;
}

export interface AgentToolResult {
  tool: string;
  success: boolean;
  summary: string;
  data?: unknown;
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
}

export interface WorkflowResult {
  workflow: string;
  steps: WorkflowStep[];
  memoryIds?: string[];
  output?: string;
}

export interface InvokeAgentResult {
  success: boolean;
  agentName: string;
  agentCode?: string;
  response: string;
  tokensUsed: number;
  model: string;
  skillName?: string;
  skillLevel?: number;
  skillProgress?: number;
  leveledUp?: boolean;
  expGained?: number;
  toolResults?: AgentToolResult[];
  workflowResults?: WorkflowResult[];
  filtered?: boolean;
  filterReason?: string;
}

interface FamilyHubState {
  /* ── Data ── */
  metrics: FamilyMetrics;
  shimoCore: ShimoCore;
  agents: AgentRuntime[];
  skills: SkillProgress[];
  timeline: TimelineEntry[];
  devices: DeviceSync[];
  familyStatus: FamilyStatusItem[];

  /* ── Meta ── */
  loading: boolean;
  error: string | null;
  hasError: boolean;
  lastSync: number;

  /* ── MCP ── */
  mcpCalls: MCPToolCall[];

  /* ── Actions ── */
  fetchAll: () => Promise<void>;
  triggerInterviewComplete: () => Promise<void>;
  triggerSkillLearn: (skillId: string) => Promise<void>;
  invokeSkillAbility: (skillId: string, payload: InvokeSkillAbilityPayload) => Promise<SkillAbilityResult>;
  invokeAgent: (agentCode: string, message: string) => Promise<InvokeAgentResult>;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  setShimoStatus: (status: ShimoStatus) => void;
  callMCPTool: (tool: string, params: Record<string, unknown>) => Promise<unknown>;
  clearMCPCalls: () => void;
}

/* ═══════════════ Default State (seed data) ═══════════════ */

const defaultMetrics: FamilyMetrics = {
  understandingPercent: 0,
  treeLevel: 0,
  treeStage: '',
  treeGrowth: 0,
  longTermMemories: 0,
  familyMembers: 0,
  weeklyGrowthPercent: 0,
  aiLevel: 0,
  masteredSkills: 0,
  activeAgents: 0,
  newAbilities: 0,
  wechatSync: 'disconnected',
  knowledgeDocs: 0,
  growthValue: 0,
  timeCapsules: 0,
  milestones: 0,
  stories: 0,
  interviews: 0,
};

const defaultShimoCore: ShimoCore = {
  status: 'online',
  understanding: 0,
  mood: 0,
  level: 0,
  agentCount: 0,
  learningCount: 0,
  recentLearning: [],
};

const defaultAgents: AgentRuntime[] = [];

const defaultSkills: SkillProgress[] = [];

const defaultTimeline: TimelineEntry[] = [];

const defaultDevices: DeviceSync[] = [
  { id: 'web', name: 'Web', status: 'connected', icon: 'Globe' },
  { id: 'wechat', name: 'WeChat', status: 'disconnected', icon: 'MessageCircle' },
  { id: 'family', name: 'Family Group', status: 'connected', icon: 'Users' },
  { id: 'memory', name: 'Memory', status: 'synced', icon: 'Database' },
  { id: 'app', name: 'App', status: 'coming_soon', icon: 'Smartphone' },
  { id: 'watch', name: 'Watch', status: 'coming_soon', icon: 'Watch' },
  { id: 'robot', name: 'Robot', status: 'coming_soon', icon: 'Bot' },
];

const defaultFamilyStatus: FamilyStatusItem[] = [];

/* ═══════════════ API Layer (with fallback) ═══════════════ */

async function fetchWithFallback<T>(endpoint: string, fallback: T): Promise<{ data: T; hasError: boolean }> {
  try {
    const data = await apiClient.get<T>(endpoint);
    return { data: data ?? fallback, hasError: false };
  } catch {
    return { data: fallback, hasError: true };
  }
}

/* ═══════════════ MCP Tool Registry ═══════════════ */

const MCP_TOOLS: Record<string, (params: Record<string, unknown>, state: FamilyHubState) => unknown> = {
  'family.get_status': (_params, state) => ({
    metrics: state.metrics,
    shimoCore: state.shimoCore,
  }),
  'family.trigger_interview': () => ({
    triggered: true,
    message: 'Interview session started. Memory and tree will update on completion.',
  }),
  'family.add_memory': (params) => ({
    added: true,
    memoryId: `mem-${Date.now()}`,
    content: params.content ?? '',
  }),
  'shimo.get_core': (_params, state) => state.shimoCore,
  'shimo.set_status': (params, state) => {
    const status = params.status as ShimoStatus;
    if (status) state.setShimoStatus(status);
    return { status: status ?? state.shimoCore.status };
  },
  'agent.list': (_params, state) => state.agents,
  'agent.update_status': (params, state) => {
    const { agentId, status } = params as { agentId: string; status: AgentStatus };
    if (agentId && status) state.updateAgentStatus(agentId, status);
    return { agentId, status };
  },
  'skill.list': (_params, state) => state.skills,
  'skill.learn': (params, state) => {
    const skillId = params.skillId as string;
    if (skillId) void state.triggerSkillLearn(skillId);
    return { skillId, learning: true };
  },
  'timeline.list': (_params, state) => state.timeline,
  'device.list': (_params, state) => state.devices,
};

const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

export function clearPendingTimers(): void {
  pendingTimers.forEach((id) => clearTimeout(id));
  pendingTimers.clear();
}

/* ═══════════════ Store ═══════════════ */

export const useFamilyHubStore = create<FamilyHubState>()(
  persist(
    (set, get) => ({
      metrics: defaultMetrics,
      shimoCore: defaultShimoCore,
      agents: defaultAgents,
      skills: defaultSkills,
      timeline: defaultTimeline,
      devices: defaultDevices,
      familyStatus: defaultFamilyStatus,

      loading: false,
      error: null,
      hasError: false,
      lastSync: Date.now(),

      mcpCalls: [],

      fetchAll: async () => {
        set({ loading: true, error: null });
        try {
          const [metricsRes, treeStatsRes, shimoCoreRes, agentsRes, skillsRes, timelineRes, devicesRes, familyStatusRes] =
        await Promise.all([
          fetchWithFallback('family-hub/metrics', defaultMetrics),
          fetchWithFallback('life-tree/stats', defaultMetrics),
          fetchWithFallback('family-hub/shimo-core', defaultShimoCore),
          fetchWithFallback('family-hub/agents', defaultAgents),
          fetchWithFallback('family-hub/skills', defaultSkills),
          fetchWithFallback('family-hub/timeline', defaultTimeline),
          fetchWithFallback('family-hub/devices', defaultDevices),
          fetchWithFallback('family-hub/family-status', defaultFamilyStatus),
        ]);

      const errorCount = [metricsRes, treeStatsRes, shimoCoreRes, agentsRes, skillsRes, timelineRes, devicesRes, familyStatusRes]
        .filter((r) => r.hasError).length;

      set({
        metrics: { ...metricsRes.data, ...treeStatsRes.data },
        shimoCore: shimoCoreRes.data,
        agents: agentsRes.data,
        skills: skillsRes.data,
        timeline: timelineRes.data,
        devices: devicesRes.data,
        familyStatus: familyStatusRes.data,
        loading: false,
        lastSync: Date.now(),
        hasError: errorCount > 0,
      });
        } catch (err) {
          set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error', hasError: true });
        }
      },

      triggerInterviewComplete: async () => {
        // Simulate real-time data updates after interview
        setShimoStatusTransient(set, 'updating_memory');

        const timer1 = setTimeout(() => {
          pendingTimers.delete(timer1);
          set((s) => ({
            metrics: {
              ...s.metrics,
              longTermMemories: s.metrics.longTermMemories + 1,
              growthValue: s.metrics.growthValue + 2,
              weeklyGrowthPercent: s.metrics.weeklyGrowthPercent + 1,
              understandingPercent: Math.min(100, s.metrics.understandingPercent + 1),
            },
            shimoCore: {
              ...s.shimoCore,
              status: 'updating_tree',
              understanding: Math.min(100, s.shimoCore.understanding + 1),
              mood: Math.min(100, (s.shimoCore.mood ?? 73) + 3),
            },
            timeline: [
              {
                id: `tl-${Date.now()}`,
                date: new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '-'),
                title: '完成 AI 访谈',
                detail: '长期记忆 +1，生命树成长',
                type: 'memory' as const,
              },
              ...s.timeline,
            ],
          }));
        }, 800);
        pendingTimers.add(timer1);

        const timer2 = setTimeout(() => {
          pendingTimers.delete(timer2);
          set((s) => ({ shimoCore: { ...s.shimoCore, status: 'online' } }));
        }, 2000);
        pendingTimers.add(timer2);
      },

      triggerSkillLearn: async (skillId: string) => {
        setShimoStatusTransient(set, 'learning');

        try {
          const result = await apiClient.post<{
            id: string;
            name: string;
            level: number;
            status: string;
            progress: number;
            message: string;
          }>(`family-hub/skills/${skillId}/learn`);

          if (result) {
            set((s) => ({
              skills: s.skills.map((sk) =>
                sk.id === skillId
                  ? {
                      ...sk,
                      status: result.status as SkillProgress['status'],
                      level: result.level,
                      progress: result.progress,
                    }
                  : sk,
              ),
              metrics: result.status === 'mastered'
                ? { ...s.metrics, masteredSkills: s.metrics.masteredSkills + 1, newAbilities: s.metrics.newAbilities + 1, growthValue: s.metrics.growthValue + 5 }
                : s.metrics,
              shimoCore: { ...s.shimoCore, status: 'online' },
            }));
          }
        } catch {
          set((s) => ({
            shimoCore: { ...s.shimoCore, status: 'online' },
            hasError: true,
          }));
        }
      },

      invokeSkillAbility: async (skillId: string, payload: InvokeSkillAbilityPayload) => {
        setShimoStatusTransient(set, 'learning');

        try {
          const result = await apiClient.post<SkillAbilityResult>(
            `family-hub/skills/${skillId}/invoke`,
            payload,
          );

          // Sync skill progress/level returned by backend
          if (result?.skillName) {
            set((s) => ({
              skills: s.skills.map((sk) => {
                if (sk.id !== skillId) return sk;
                const nextLevel = result.skillLevel ?? sk.level;
                const nextProgress = result.skillProgress ?? sk.progress;
                let nextStatus = sk.status;
                if (result.leveledUp) {
                  nextStatus = nextLevel >= 10 ? 'mastered' : 'learning';
                } else if (sk.status === 'new' && (result.expGained ?? 0) > 0) {
                  nextStatus = 'learning';
                }
                return {
                  ...sk,
                  level: nextLevel,
                  progress: nextProgress,
                  status: nextStatus,
                };
              }),
              shimoCore: { ...s.shimoCore, status: 'online' },
            }));
          } else {
            set((s) => ({ shimoCore: { ...s.shimoCore, status: 'online' } }));
          }

          return result;
        } catch (err) {
          set((s) => ({ shimoCore: { ...s.shimoCore, status: 'online' } }));
          throw err;
        }
      },

      invokeAgent: async (agentCode: string, message: string) => {
        // Optimistically set agent to thinking
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === agentCode ? { ...a, status: 'thinking' as const } : a,
          ),
        }));

        try {
          const result = await apiClient.post<InvokeAgentResult>(
            `family-hub/agents/${agentCode}/invoke`,
            { message },
          );

          // Update agent status back to running and increment calls
          set((s) => ({
            agents: s.agents.map((a) =>
              a.id === agentCode
                ? { ...a, status: 'running' as const, calls: a.calls + 1, lastActive: '刚刚' }
                : a,
            ),
          }));

          // Sync skill level/progress returned by backend so UI reflects evolution immediately
          if (result?.skillName) {
            set((s) => ({
              skills: s.skills.map((sk) => {
                const matchesAgent =
                  sk.sourceAgentCode === agentCode ||
                  sk.sourceAgent === result.agentName;
                if (!matchesAgent || sk.name !== result.skillName) return sk;

                const nextLevel = result.skillLevel ?? sk.level;
                const nextProgress = result.skillProgress ?? sk.progress;
                let nextStatus = sk.status;
                if (result.leveledUp) {
                  nextStatus = nextLevel >= 10 ? 'mastered' : 'learning';
                } else if (sk.status === 'new' && (result.expGained ?? 0) > 0) {
                  nextStatus = 'learning';
                }

                return {
                  ...sk,
                  level: nextLevel,
                  progress: nextProgress,
                  status: nextStatus,
                };
              }),
            }));
          }

          return result || {
            success: false,
            response: 'Agent 响应失败',
            agentName: agentCode,
            tokensUsed: 0,
            model: '',
          };
        } catch (err) {
          // Reset agent status on error
          set((s) => ({
            agents: s.agents.map((a) =>
              a.id === agentCode ? { ...a, status: 'idle' as const } : a,
            ),
          }));

          return {
            success: false,
            response: `调用失败：${err instanceof Error ? err.message : '请检查后端服务和 API Key 配置'}`,
            agentName: agentCode,
            tokensUsed: 0,
            model: '',
          };
        }
      },

      updateAgentStatus: (agentId: string, status: AgentStatus) => {
        set((s) => ({
          agents: s.agents.map((a) => (a.id === agentId ? { ...a, status } : a)),
        }));
      },

      setShimoStatus: (status: ShimoStatus) => {
        set((s) => ({ shimoCore: { ...s.shimoCore, status } }));
      },

      callMCPTool: async (tool: string, params: Record<string, unknown>) => {
        const callId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        set((s) => ({
          mcpCalls: [
            ...s.mcpCalls,
            { id: callId, tool, params, status: 'calling' as const, timestamp: Date.now() },
          ],
        }));

        try {
          const handler = MCP_TOOLS[tool];
          if (!handler) throw new Error(`Unknown MCP tool: ${tool}`);

          // Simulate async latency
          await new Promise((r) => setTimeout(r, 300));
          const result = handler(params, get());

          set((s) => ({
            mcpCalls: s.mcpCalls.map((c) =>
              c.id === callId ? { ...c, result, status: 'success' as const } : c,
            ),
          }));

          return result;
        } catch (err) {
          set((s) => ({
            mcpCalls: s.mcpCalls.map((c) =>
              c.id === callId ? { ...c, status: 'error' as const, result: err } : c,
            ),
          }));
          throw err;
        }
      },

      clearMCPCalls: () => set({ mcpCalls: [] }),
    }),
    {
      name: 'suiyan-family-hub',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        metrics: s.metrics,
        shimoCore: s.shimoCore,
        agents: s.agents,
        skills: s.skills,
        timeline: s.timeline,
        devices: s.devices,
        familyStatus: s.familyStatus,
        lastSync: s.lastSync,
      }),
    },
  ),
);

/* ── Helper: transient status with auto-recovery ── */
function setShimoStatusTransient(
  set: (fn: (s: FamilyHubState) => Partial<FamilyHubState>) => void,
  status: ShimoStatus,
) {
  set((s) => ({ shimoCore: { ...s.shimoCore, status } }));
}
