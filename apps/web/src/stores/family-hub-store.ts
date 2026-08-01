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
  understandingPercent: 89,
  treeLevel: 8,
  treeStage: 'Young Tree',
  treeGrowth: 0.55,
  longTermMemories: 428,
  familyMembers: 5,
  weeklyGrowthPercent: 18,
  aiLevel: 12,
  masteredSkills: 53,
  activeAgents: 16,
  newAbilities: 3,
  wechatSync: 'connected',
  knowledgeDocs: 128,
  growthValue: 56,
  timeCapsules: 12,
  milestones: 8,
  stories: 312,
  interviews: 24,
};

const defaultShimoCore: ShimoCore = {
  status: 'online',
  understanding: 89,
  mood: 73,
  level: 12,
  agentCount: 16,
  learningCount: 3,
  recentLearning: ['家庭收纳', '家电维修', '慢病管理'],
};

const defaultAgents: AgentRuntime[] = [
  { id: 'life', name: 'Life Agent', role: '生活管理', status: 'running', level: 5, lastActive: '刚刚', calls: 128, icon: 'Heart' },
  { id: 'kitchen', name: 'Kitchen Agent', role: '智慧厨房', status: 'thinking', level: 8, lastActive: '2分钟前', calls: 89, icon: 'ChefHat' },
  { id: 'repair', name: 'Repair Agent', role: '家庭维修', status: 'idle', level: 4, lastActive: '1小时前', calls: 45, icon: 'Wrench' },
  { id: 'knowledge', name: 'Knowledge Agent', role: '知识库', status: 'syncing', level: 6, lastActive: '5分钟前', calls: 156, icon: 'BookOpen' },
  { id: 'health', name: 'Health Agent', role: '健康监测', status: 'learning', level: 4, lastActive: '10分钟前', calls: 67, icon: 'HeartPulse' },
  { id: 'travel', name: 'Travel Agent', role: '旅行规划', status: 'ready', level: 3, lastActive: '2天前', calls: 34, icon: 'Plane' },
  { id: 'care', name: 'Care Agent', role: '老人陪伴', status: 'learning', level: 2, lastActive: '3小时前', calls: 23, icon: 'HandHeart' },
  { id: 'growth', name: 'Growth Agent', role: '成长追踪', status: 'running', level: 5, lastActive: '刚刚', calls: 203, icon: 'Sprout' },
  { id: 'emotion', name: 'Emotion Agent', role: '情绪分析', status: 'thinking', level: 4, lastActive: '8分钟前', calls: 98, icon: 'Smile' },
  { id: 'shopping', name: 'Shopping Agent', role: '购物顾问', status: 'running', level: 4, lastActive: '15分钟前', calls: 112, icon: 'ShoppingCart' },
  { id: 'pet', name: 'Pet Agent', role: '宠物护理', status: 'idle', level: 2, lastActive: '5小时前', calls: 18, icon: 'PawPrint' },
  { id: 'finance', name: 'Finance Agent', role: '家庭财务', status: 'learning', level: 1, lastActive: '1天前', calls: 8, icon: 'TrendingUp' },
  { id: 'life_coach', name: 'Life Coach', role: '生命教练', status: 'running', level: 3, lastActive: '刚刚', calls: 256, icon: 'Sparkles', color: 'var(--color-success)' },
  { id: 'story_agent', name: 'Story Agent', role: '故事创作', status: 'ready', level: 2, lastActive: '刚刚', calls: 78, icon: 'BookOpen', color: 'var(--color-purple)' },
];

const defaultSkills: SkillProgress[] = [
  { id: 'kitchen', name: '智慧厨房', level: 8, status: 'new', sourceAgent: 'Kitchen Agent', sourceAgentCode: 'kitchen', icon: 'ChefHat', color: 'var(--color-highlight)' },
  { id: 'elder', name: '老人陪伴', level: 6, status: 'updated', sourceAgent: 'Care Agent', sourceAgentCode: 'care', icon: 'HandHeart', color: 'var(--color-orange)' },
  { id: 'plant', name: '植物养护', level: 1, status: 'learning', progress: 82, sourceAgent: 'Life Agent', sourceAgentCode: 'life', icon: 'Sprout', color: 'var(--color-success)' },
  { id: 'repair', name: '维修助手', level: 4, status: 'mastered', sourceAgent: 'Repair Agent', sourceAgentCode: 'repair', icon: 'Wrench', color: 'var(--color-secondary)' },
  { id: 'cooking', name: '菜谱推荐', level: 7, status: 'mastered', sourceAgent: 'Kitchen Agent', sourceAgentCode: 'kitchen', icon: 'ChefHat', color: 'var(--color-orange)' },
  { id: 'shopping', name: '购物顾问', level: 5, status: 'mastered', sourceAgent: 'Shopping Agent', sourceAgentCode: 'shopping', icon: 'ShoppingCart', color: 'var(--color-info)' },
  { id: 'travel', name: '旅行规划', level: 4, status: 'mastered', sourceAgent: 'Travel Agent', sourceAgentCode: 'travel', icon: 'Plane', color: 'var(--color-purple)' },
  { id: 'health', name: '健康监测', level: 3, status: 'updated', sourceAgent: 'Health Agent', sourceAgentCode: 'health', icon: 'HeartPulse', color: 'var(--color-error)' },
  { id: 'life_coach_listening', name: '情绪倾听', level: 2, status: 'learning', progress: 45, sourceAgent: 'Life Coach', sourceAgentCode: 'life_coach', icon: 'Heart', color: 'var(--color-error)' },
  { id: 'life_coach_advice', name: '生活建议', level: 3, status: 'learning', progress: 60, sourceAgent: 'Life Coach', sourceAgentCode: 'life_coach', icon: 'Lightbulb', color: 'var(--color-highlight)' },
  { id: 'story_agent_narrative', name: '叙事创作', level: 2, status: 'learning', progress: 55, sourceAgent: 'Story Agent', sourceAgentCode: 'story_agent', icon: 'BookOpen', color: 'var(--color-purple)' },
  { id: 'story_agent_emotion', name: '情感渲染', level: 1, status: 'new', progress: 20, sourceAgent: 'Story Agent', sourceAgentCode: 'story_agent', icon: 'Sparkles', color: 'var(--color-highlight)' },
];

const defaultTimeline: TimelineEntry[] = [
  { id: '1', date: '06-28', title: '学习：空气炸锅说明书', detail: 'Kitchen Skill Lv+1', type: 'skill' },
  { id: '2', date: '06-27', title: '新增：家庭收纳 Skill', detail: 'Life Agent 完成学习', type: 'skill' },
  { id: '3', date: '06-25', title: '新增：Care Agent', detail: '学习老年心理学知识库', type: 'agent' },
  { id: '4', date: '06-22', title: '新增 5 段珍贵回忆', detail: '访谈记录归档至长期记忆', type: 'memory' },
  { id: '5', date: '06-20', title: '新增：Plant Agent', detail: '识别到家庭植物养护需求', type: 'agent' },
  { id: '6', date: '06-21', title: '新增：植物养护 Skill', detail: '学习多肉植物养护指南', type: 'skill' },
  { id: '7', date: '06-18', title: '生命树长出新枝', detail: '家庭关系分支进一步繁茂', type: 'tree' },
  { id: '8', date: '06-15', title: '微信同步已连接', detail: '家庭群消息开始同步', type: 'device' },
];

const defaultDevices: DeviceSync[] = [
  { id: 'web', name: 'Web', status: 'connected', icon: 'Globe' },
  { id: 'wechat', name: 'WeChat', status: 'disconnected', icon: 'MessageCircle' },
  { id: 'family', name: 'Family Group', status: 'connected', icon: 'Users' },
  { id: 'memory', name: 'Memory', status: 'synced', icon: 'Database' },
  { id: 'app', name: 'App', status: 'coming_soon', icon: 'Smartphone' },
  { id: 'watch', name: 'Watch', status: 'coming_soon', icon: 'Watch' },
  { id: 'robot', name: 'Robot', status: 'coming_soon', icon: 'Bot' },
];

const defaultFamilyStatus: FamilyStatusItem[] = [
  { id: 'mood', label: '家庭情绪', value: '温暖', sub: '全员状态良好', color: 'var(--color-highlight)', icon: 'Smile' },
  { id: 'memory', label: '本周新增回忆', value: '3 段', sub: '昨天新增了1段', color: 'var(--color-info)', icon: 'BookOpen' },
  { id: 'tree', label: '生命树成长', value: 'Lv.8', sub: 'Young Tree 阶段', color: 'var(--color-success)', icon: 'TreePine' },
  { id: 'advice', label: '今日家庭建议', value: '给爸妈打个电话', sub: '已3天未联系', color: 'var(--color-error)', icon: 'Heart' },
  { id: 'todo', label: '本周待办', value: '周末家庭聚餐', sub: '周六晚上', color: 'var(--color-purple)', icon: 'Calendar' },
  { id: 'ai', label: 'AI理解程度', value: '89%', sub: '持续学习中', color: 'var(--color-secondary)', icon: 'Brain' },
];

/* ═══════════════ API Layer (with fallback) ═══════════════ */

async function fetchWithFallback<T>(endpoint: string, fallback: T): Promise<T> {
  try {
    const data = await apiClient.get<T>(endpoint);
    return data ?? fallback;
  } catch {
    return fallback;
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
      lastSync: Date.now(),

      mcpCalls: [],

      fetchAll: async () => {
        set({ loading: true, error: null });
        try {
          const [metrics, treeStats, shimoCore, agents, skills, timeline, devices, familyStatus] =
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

      set({
        metrics: { ...metrics, ...treeStats },
        shimoCore,
        agents,
        skills,
        timeline,
        devices,
        familyStatus,
        loading: false,
        lastSync: Date.now(),
      });
        } catch (err) {
          set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      },

      triggerInterviewComplete: async () => {
        // Simulate real-time data updates after interview
        setShimoStatusTransient(set, 'updating_memory');

        setTimeout(() => {
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

        setTimeout(() => {
          set((s) => ({ shimoCore: { ...s.shimoCore, status: 'online' } }));
        }, 2000);
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
          // Fallback to local simulation if API fails
          setTimeout(() => {
            set((s) => ({
              skills: s.skills.map((sk) =>
                sk.id === skillId
                  ? { ...sk, status: 'updated' as const, level: sk.level + 1, progress: 100 }
                  : sk,
              ),
              metrics: {
                ...s.metrics,
                masteredSkills: s.metrics.masteredSkills + 1,
                newAbilities: s.metrics.newAbilities + 1,
                growthValue: s.metrics.growthValue + 5,
              },
              shimoCore: { ...s.shimoCore, status: 'online' },
            }));
          }, 1500);
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
