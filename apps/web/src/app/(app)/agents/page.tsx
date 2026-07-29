'use client';

/**
 * /agents — Agent Ecosystem Console
 * ---------------------------------
 * A single-page cockpit for the 16 EchoLife agents that live inside the
 * OpenClaw ReAct runtime. Each row surfaces:
 *   - Live status pill (running / thinking / idle / …)
 *   - Level + total invocation count
 *   - Skill count derived from the shared skills tree
 *   - "对话" quick-action that reuses the AgentChatModal
 *
 * The layout is deliberately density-first: 16 agents need to be scannable
 * without pagination. Uses the Liquid Glass tokens exclusively.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Zap,
  TrendingUp,
  Sparkles,
  Activity,
  Search,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { useFamilyHubStore, type AgentRuntime } from '@/stores/family-hub-store';
import { getIcon } from '@/components/home/icon-map';
import AgentChatModal from '@/components/home/agent-chat-modal';

/* ═══════════════ Status → tone mapping ═══════════════ */

const STATUS_TOKEN: Record<
  AgentRuntime['status'],
  { label: string; fg: string; bg: string; pulse: boolean }
> = {
  running: {
    label: '运行中',
    fg: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    pulse: true,
  },
  thinking: {
    label: '思考中',
    fg: 'var(--color-highlight)',
    bg: 'var(--color-warning-bg)',
    pulse: true,
  },
  syncing: {
    label: '同步中',
    fg: 'var(--color-secondary)',
    bg: 'var(--color-info-bg)',
    pulse: true,
  },
  learning: {
    label: '学习中',
    fg: 'var(--color-purple)',
    bg: 'color-mix(in srgb, var(--color-purple) 12%, transparent)',
    pulse: true,
  },
  ready: {
    label: '就绪',
    fg: 'var(--color-primary)',
    bg: 'var(--color-primary-soft)',
    pulse: false,
  },
  idle: {
    label: '待命',
    fg: 'var(--color-text-secondary)',
    bg: 'var(--color-glass)',
    pulse: false,
  },
};

/* ═══════════════ Main page ═══════════════ */

export default function AgentsConsolePage() {
  const agents = useFamilyHubStore((s) => s.agents);
  const skills = useFamilyHubStore((s) => s.skills);
  const [search, setSearch] = useState('');
  const [chatAgent, setChatAgent] = useState<AgentRuntime | null>(null);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q),
    );
  }, [agents, search]);

  const totals = useMemo(() => {
    return {
      count: agents.length,
      running: agents.filter((a) => a.status === 'running' || a.status === 'thinking').length,
      calls: agents.reduce((sum, a) => sum + (a.calls ?? 0), 0),
      avgLevel: agents.length
        ? Math.round(agents.reduce((sum, a) => sum + (a.level ?? 0), 0) / agents.length)
        : 0,
    };
  }, [agents]);

  return (
    <PageTransition>
      <div className="px-4 pt-4 pb-6 sm:px-6 sm:pt-6 max-w-7xl mx-auto">
        {/* ═══════ Header ═══════ */}
        <HeaderRow totals={totals} search={search} onSearch={setSearch} />

        {/* ═══════ Agent Grid ═══════ */}
        {filteredAgents.length === 0 ? (
          <EmptyState />
        ) : (
          <StaggerContainer className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <StaggerItem key={agent.id}>
                <AgentCard
                  agent={agent}
                  skillCount={
                    skills.filter((s) => s.sourceAgentCode === agent.id || s.sourceAgent === agent.name).length
                  }
                  onChat={() => setChatAgent(agent)}
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      <AgentChatModal agent={chatAgent} open={!!chatAgent} onClose={() => setChatAgent(null)} />
    </PageTransition>
  );
}

/* ═══════════════ Header Row ═══════════════ */

function HeaderRow({
  totals,
  search,
  onSearch,
}: {
  totals: { count: number; running: number; calls: number; avgLevel: number };
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-text tracking-tight">Agent 控制台</h1>
        <p className="mt-1 text-xs text-text-secondary">
          OpenClaw ReAct 运行时 · {totals.count} 个协作 Agent · 平均 Lv.{totals.avgLevel}
        </p>
      </div>

      {/* Compact metric strip */}
      <div className="flex items-stretch gap-2">
        <MetricPill
          icon={<Activity className="h-3.5 w-3.5" />}
          label="活跃"
          value={`${totals.running}/${totals.count}`}
          color="var(--color-success)"
        />
        <MetricPill
          icon={<Zap className="h-3.5 w-3.5" />}
          label="调用"
          value={totals.calls.toLocaleString('en-US')}
          color="var(--color-highlight)"
        />
        <MetricPill
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="等级"
          value={`Lv.${totals.avgLevel}`}
          color="var(--color-secondary)"
        />
      </div>

      {/* Search */}
      <GlassLayer
        intensity="subtle"
        className="flex items-center gap-2 px-3 py-1.5 sm:w-60"
      >
        <Search className="h-3.5 w-3.5 text-text-subtle flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索 Agent 名称或角色…"
          aria-label="搜索 Agent"
          className="w-full bg-transparent text-xs text-text placeholder:text-text-subtle outline-none focus-ring"
        />
      </GlassLayer>
    </div>
  );
}

function MetricPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <GlassLayer intensity="subtle" className="px-3 py-1.5 flex items-center gap-2">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-4xs uppercase tracking-widest text-text-subtle">
          {label}
        </span>
        <span className="text-xs font-semibold text-text">{value}</span>
      </div>
    </GlassLayer>
  );
}

/* ═══════════════ Agent Card ═══════════════ */

function AgentCard({
  agent,
  skillCount,
  onChat,
}: {
  agent: AgentRuntime;
  skillCount: number;
  onChat: () => void;
}) {
  const Icon = getIcon(agent.icon);
  const status = STATUS_TOKEN[agent.status];
  const color = agent.color || 'var(--color-secondary)';

  return (
    <GlassLayer
      intensity="default"
      interactive
      className="p-4 flex flex-col gap-3 h-full"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text truncate">{agent.name}</h3>
            <span
              className="text-4xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ backgroundColor: 'var(--color-glass)', color: 'var(--color-text-secondary)' }}
            >
              Lv.{agent.level}
            </span>
          </div>
          <p className="text-3xs text-text-subtle truncate mt-0.5">{agent.role}</p>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-2xs text-text-muted leading-relaxed line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Capabilities chips */}
      {agent.capabilities && agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="text-4xs px-1.5 py-0.5 rounded-full text-text-secondary"
              style={{ backgroundColor: 'var(--color-glass)' }}
            >
              {cap}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="text-4xs px-1.5 py-0.5 rounded-full text-text-subtle">
              +{agent.capabilities.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
        <MiniMetric label="调用" value={(agent.calls ?? 0).toLocaleString('en-US')} />
        <MiniMetric label="技能" value={`${skillCount}`} />
        <MiniMetric label="活跃" value={agent.lastActive ?? '-'} />
      </div>

      {/* CTA */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onChat}
        aria-label={`和 ${agent.name} 对话`}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors focus-ring"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
        }}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>对话</span>
      </motion.button>
    </GlassLayer>
  );
}

/* ═══════════════ Small parts ═══════════════ */

function StatusPill({ status }: { status: (typeof STATUS_TOKEN)[keyof typeof STATUS_TOKEN] }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full px-2 py-0.5 flex-shrink-0"
      style={{ backgroundColor: status.bg }}
    >
      <motion.span
        animate={status.pulse ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
        transition={{ duration: 1.6, repeat: status.pulse ? Infinity : 0, ease: 'easeInOut' }}
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: status.fg }}
      />
      <span className="text-4xs font-medium" style={{ color: status.fg }}>
        {status.label}
      </span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-4xs uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <span className="text-xs font-semibold text-text truncate w-full">
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <GlassLayer intensity="subtle" className="mt-6 py-12 flex flex-col items-center gap-2">
      <Sparkles className="h-8 w-8 text-text-subtle" />
      <p className="text-sm text-text-secondary">没有匹配的 Agent</p>
      <p className="text-3xs text-text-subtle">试试换个关键词，或清空搜索框</p>
    </GlassLayer>
  );
}
