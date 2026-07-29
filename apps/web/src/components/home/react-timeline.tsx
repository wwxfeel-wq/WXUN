'use client';

/**
 * ReActTimeline
 * -------------
 * Compact horizontal Plan → Reason → Act → Observe visualization used in the
 * agent-chat-modal header. Each node lights up progressively as the OpenClaw
 * ReAct loop advances:
 *
 *   - `Plan`     — always considered done once an invocation starts
 *   - `Reason`   — done when the model has emitted a response
 *   - `Act`      — done when tools have been invoked (any success)
 *   - `Observe`  — done when workflow/tool results have been reflected back
 */

import { motion } from 'framer-motion';
import { Compass, Brain, Wrench, Eye } from 'lucide-react';
import type { InvokeAgentResult } from '@/stores/family-hub-store';

export type ReActPhase = 'plan' | 'reason' | 'act' | 'observe';

interface ReActTimelineProps {
  /** True while the agent invocation is in-flight. */
  running: boolean;
  /** Latest completed invocation result (drives which nodes light up). */
  lastResult?: InvokeAgentResult | null;
}

const NODES: {
  id: ReActPhase;
  label: string;
  icon: typeof Compass;
  color: string;
}[] = [
  { id: 'plan', label: 'Plan', icon: Compass, color: 'var(--color-secondary)' },
  { id: 'reason', label: 'Reason', icon: Brain, color: 'var(--color-highlight)' },
  { id: 'act', label: 'Act', icon: Wrench, color: 'var(--color-primary)' },
  { id: 'observe', label: 'Observe', icon: Eye, color: 'var(--color-purple)' },
];

export function ReActTimeline({ running, lastResult }: ReActTimelineProps) {
  const hasResponse = Boolean(lastResult?.response);
  const hasTools = (lastResult?.toolResults?.length ?? 0) > 0;
  const hasWorkflow = (lastResult?.workflowResults?.length ?? 0) > 0;

  const status: Record<ReActPhase, 'done' | 'active' | 'idle'> = {
    plan: running || hasResponse ? 'done' : 'idle',
    reason: hasResponse ? 'done' : running ? 'active' : 'idle',
    act: hasTools ? 'done' : running && hasResponse ? 'active' : 'idle',
    observe: hasWorkflow || (hasResponse && hasTools) ? 'done' : 'idle',
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
      <span className="text-4xs uppercase tracking-widest text-text-subtle flex-shrink-0 mr-1">
        ReAct
      </span>
      {NODES.map((node, idx) => (
        <div key={node.id} className="flex items-center flex-shrink-0">
          <Node
            label={node.label}
            Icon={node.icon}
            color={node.color}
            state={status[node.id]}
          />
          {idx < NODES.length - 1 && (
            <Connector nextActive={status[NODES[idx + 1].id] !== 'idle'} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ Node ═══════════════ */

function Node({
  label,
  Icon,
  color,
  state,
}: {
  label: string;
  Icon: typeof Compass;
  color: string;
  state: 'done' | 'active' | 'idle';
}) {
  const isDone = state === 'done';
  const isActive = state === 'active';
  const fg = isDone || isActive ? color : 'var(--color-text-subtle)';
  const bg =
    isDone || isActive
      ? `color-mix(in srgb, ${color} 14%, transparent)`
      : 'var(--color-glass)';
  const glow = isActive
    ? `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`
    : isDone
      ? `0 0 6px color-mix(in srgb, ${color} 32%, transparent)`
      : 'none';

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: state === 'idle' ? 0.55 : 1,
        scale: isActive ? 1.02 : 1,
      }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-1 rounded-full px-2 py-1"
      style={{ backgroundColor: bg, boxShadow: glow }}
    >
      <motion.span
        animate={isActive ? { rotate: [0, 8, -8, 0] } : { rotate: 0 }}
        transition={{ duration: 1.4, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
      >
        <Icon className="h-3 w-3" style={{ color: fg }} />
      </motion.span>
      <span className="text-3xs font-medium" style={{ color: fg }}>
        {label}
      </span>
      {isActive && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: fg }}
        />
      )}
    </motion.div>
  );
}

/* ═══════════════ Connector ═══════════════ */

function Connector({ nextActive }: { nextActive: boolean }) {
  return (
    <div className="relative mx-0.5 h-px w-4 sm:w-6 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--color-glass-border)]" />
      {nextActive && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent"
        />
      )}
    </div>
  );
}
