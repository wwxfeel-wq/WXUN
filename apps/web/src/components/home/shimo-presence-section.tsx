'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useFamilyHubStore, type AgentRuntime, type AgentStatus } from '@/stores/family-hub-store';
import { getIcon } from '@/components/home/icon-map';
import { StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassCard } from '@/components/glass';
import AgentChatModal from '@/components/home/agent-chat-modal';

/* ── Spring transition shared across the section ── */
const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

/* ── Status metadata translated to family language ── */
interface PresenceStatusMeta {
  label: string;
  color: string;
  pulse: boolean;
}

const PRESENCE_STATUS_META: Record<AgentStatus, PresenceStatusMeta> = {
  running: { label: '在陪伴', color: 'var(--color-success)', pulse: true },
  thinking: { label: '在思考', color: 'var(--color-secondary)', pulse: false },
  idle: { label: '在休息', color: 'var(--color-gray-500)', pulse: false },
  syncing: { label: '在整理', color: 'var(--color-info)', pulse: false },
  learning: { label: '在学习', color: 'var(--color-highlight)', pulse: false },
  ready: { label: '已就绪', color: 'var(--color-purple)', pulse: false },
};

/**
 * 时墨的状态
 *
 * 把后台 Agent Runtime 重新包装为「时墨的不同面向」。
 * 用户看到的不是「Agent 列表」，而是「时墨正在以哪些方式陪伴这个家」。
 */
export function ShimoPresenceSection() {
  const agents = useFamilyHubStore((s) => s.agents);

  const [selectedAgent, setSelectedAgent] = React.useState<AgentRuntime | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);

  const handleTrigger = React.useCallback((agent: AgentRuntime) => {
    setSelectedAgent(agent);
    setChatOpen(true);
  }, []);

  const handleClose = React.useCallback(() => {
    setChatOpen(false);
  }, []);

  const activeCount = agents.filter((a) => a.status === 'running' || a.status === 'thinking').length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">时墨的状态</h2>
        <p className="text-xs text-text-subtle mt-1">
          {activeCount > 0
            ? `时墨正以 ${activeCount} 种方式陪伴这个家`
            : '时墨正在休息，随时准备回应你'}
        </p>
      </div>

      {/* Agents grid: 2 / 3 / 4 columns */}
      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-fr">
        {agents.map((agent) => (
          <StaggerItem key={agent.id} className="h-full">
            <PresenceCard agent={agent} onTrigger={handleTrigger} />
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Agent chat modal (kept for real interaction) */}
      <AgentChatModal agent={selectedAgent} open={chatOpen} onClose={handleClose} />
    </motion.section>
  );
}

function PresenceCard({
  agent,
  onTrigger,
}: {
  agent: AgentRuntime;
  onTrigger: (agent: AgentRuntime) => void;
}) {
  const meta = PRESENCE_STATUS_META[agent.status] ?? PRESENCE_STATUS_META.idle;
  const Icon = getIcon(agent.icon);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onTrigger(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTrigger(agent);
        }
      }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
    >
      <GlassCard
        hoverable
        className="p-4 cursor-pointer h-full"
        caustic={false}
        shadow={false}
        style={{ borderColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
      >
        <div className="relative flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              color: meta.color,
              backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.color} 16%, transparent)`,
            }}
          >
            <Icon size={16} />
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text truncate">{agent.name.replace(' Agent', '')}</p>
            <p className="text-3xs text-text-subtle truncate mt-0.5">{agent.role}</p>
          </div>

          <span className="relative flex h-2 w-2 shrink-0 mt-1" title={meta.label}>
            {meta.pulse && (
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full"
                style={{ backgroundColor: meta.color }}
                animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
          </span>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-3xs text-text-subtle">
          <Sparkles size={11} style={{ color: meta.color }} />
          <span>{meta.label}</span>
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default ShimoPresenceSection;
