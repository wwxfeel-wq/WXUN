'use client';

/**
 * WeChat Operational Control Bar
 * ------------------------------
 * A telemetry ribbon that sits above the /wechat-bot workspace. It surfaces
 * three runtime tiles so the operator can see, at a glance, whether the
 * OpenClaw ReAct runtime is healthy, whether the wechat4u session is alive,
 * and whether the Emergency Bridge fallback is armed.
 *
 * All colors, spacing and radii are pulled from the SuiYan V3 design tokens
 * to keep the ribbon aligned with the Liquid Glass language.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Wifi,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Users,
  Cpu,
  LifeBuoy,
} from 'lucide-react';
import { GlassLayer } from '@/components/glass';

/* ═══════════════ Types ═══════════════ */

export type OpsTileTone = 'ok' | 'warn' | 'error' | 'idle' | 'pending';

export interface WechatOpsBarProps {
  /** OpenClaw ReAct runtime state derived from Shimo core + recent invocations. */
  runtime: {
    tone: OpsTileTone;
    label: string;
    latencyMs?: number;
    modelName?: string;
    activeAgents?: number;
  };
  /** wechat4u puppet session state. */
  session: {
    tone: OpsTileTone;
    label: string;
    nickName?: string | null;
    contactCount?: number;
    lastError?: string | null;
    phase?: string;
  };
  /** Emergency Bridge — pure AI-only fallback used when WeChat is offline. */
  bridge: {
    tone: OpsTileTone;
    label: string;
    detail?: string;
  };
  /** Optional refresh handler for the bar-level action. */
  onRefresh?: () => void;
}

/* ═══════════════ Tone → Token mapping ═══════════════ */

const TONE_TOKENS: Record<
  OpsTileTone,
  { fg: string; bg: string; glow: string; border: string }
> = {
  ok: {
    fg: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    glow: 'var(--color-primary-glow)',
    border: 'var(--color-success)',
  },
  warn: {
    fg: 'var(--color-highlight)',
    bg: 'var(--color-warning-bg)',
    glow: 'var(--color-highlight-glow)',
    border: 'var(--color-highlight)',
  },
  error: {
    fg: 'var(--color-error)',
    bg: 'var(--color-error-bg)',
    glow: 'var(--color-warm-glow)',
    border: 'var(--color-error)',
  },
  idle: {
    fg: 'var(--color-text-secondary)',
    bg: 'var(--color-glass)',
    glow: 'transparent',
    border: 'var(--color-glass-border)',
  },
  pending: {
    fg: 'var(--color-secondary)',
    bg: 'var(--color-info-bg)',
    glow: 'var(--color-secondary-glow)',
    border: 'var(--color-secondary)',
  },
};

/* ═══════════════ Main ═══════════════ */

export function WechatOpsBar({ runtime, session, bridge, onRefresh }: WechatOpsBarProps) {
  const overall: OpsTileTone = useMemo(() => {
    const tones = [runtime.tone, session.tone, bridge.tone];
    if (tones.includes('error')) return 'error';
    if (tones.includes('warn')) return 'warn';
    if (tones.every((t) => t === 'ok')) return 'ok';
    if (tones.includes('pending')) return 'pending';
    return 'idle';
  }, [runtime.tone, session.tone, bridge.tone]);

  return (
    <GlassLayer
      intensity="subtle"
      className="mx-3 mt-3 px-3 py-2 sm:mx-4 sm:mt-4 sm:px-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {/* Header status pill */}
        <div className="flex items-center gap-2">
          <OverallPill tone={overall} />
          <div className="hidden md:block">
            <p className="text-3xs uppercase tracking-widest text-text-subtle">
              WeChat Ops Console
            </p>
            <p className="text-xs text-text-secondary">
              OpenClaw · wechat4u · Emergency Bridge 实时链路
            </p>
          </div>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <OpsTile
            tone={runtime.tone}
            icon={<Cpu className="h-3.5 w-3.5" />}
            title="OpenClaw"
            primary={runtime.label}
            secondary={
              runtime.latencyMs != null
                ? `${runtime.latencyMs}ms · ${runtime.activeAgents ?? 0} Agent`
                : runtime.modelName ?? 'ReAct Runtime'
            }
          />
          <OpsTile
            tone={session.tone}
            icon={<Wifi className="h-3.5 w-3.5" />}
            title="wechat4u"
            primary={session.label}
            secondary={
              session.nickName
                ? `${session.nickName} · ${session.contactCount ?? 0} 联系人`
                : session.lastError
                  ? '同步异常（后台重连）'
                  : session.phase === 'waiting_scan'
                    ? '等待扫码'
                    : '未登录'
            }
          />
          <OpsTile
            tone={bridge.tone}
            icon={<LifeBuoy className="h-3.5 w-3.5" />}
            title="Emergency"
            primary={bridge.label}
            secondary={bridge.detail ?? 'AI 直连兜底可用'}
          />
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onRefresh}
            aria-label="刷新运营状态"
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[var(--color-glass-border)] px-3 py-1.5 text-3xs text-text-muted hover:border-[var(--color-glass-border-hover)] hover:text-text transition-colors focus-ring"
          >
            <Activity className="h-3 w-3" />
            <span>刷新</span>
          </motion.button>
        )}
      </div>
    </GlassLayer>
  );
}

/* ═══════════════ Overall pill ═══════════════ */

function OverallPill({ tone }: { tone: OpsTileTone }) {
  const tokens = TONE_TOKENS[tone];
  const label =
    tone === 'ok'
      ? '全部在线'
      : tone === 'warn'
        ? '部分降级'
        : tone === 'error'
          ? '需要关注'
          : tone === 'pending'
            ? '连接中'
            : '待机';

  const Icon =
    tone === 'ok'
      ? ShieldCheck
      : tone === 'warn'
        ? AlertTriangle
        : tone === 'error'
          ? AlertTriangle
          : tone === 'pending'
            ? Loader2
            : Users;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        backgroundColor: tokens.bg,
        border: `1px solid color-mix(in srgb, ${tokens.border} 30%, transparent)`,
        boxShadow: `0 0 12px ${tokens.glow}`,
      }}
    >
      <Icon
        className={`h-3 w-3 ${tone === 'pending' ? 'animate-spin' : ''}`}
        style={{ color: tokens.fg }}
      />
      <span className="text-3xs font-semibold" style={{ color: tokens.fg }}>
        {label}
      </span>
    </div>
  );
}

/* ═══════════════ Tile ═══════════════ */

function OpsTile({
  tone,
  icon,
  title,
  primary,
  secondary,
}: {
  tone: OpsTileTone;
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
}) {
  const tokens = TONE_TOKENS[tone];
  return (
    <GlassLayer
      intensity="subtle"
      className="relative flex flex-col gap-0.5 px-2.5 py-1.5"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.bg, color: tokens.fg }}
        >
          {icon}
        </span>
        <span className="text-4xs uppercase tracking-wider text-text-subtle">
          {title}
        </span>
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: tokens.fg,
            boxShadow: `0 0 8px ${tokens.glow}`,
          }}
        />
      </div>
      <p
        className="text-xs font-semibold truncate"
        style={{ color: tokens.fg }}
      >
        {primary}
      </p>
      <p className="text-3xs text-text-muted truncate">{secondary}</p>
    </GlassLayer>
  );
}
