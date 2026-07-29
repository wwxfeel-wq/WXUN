'use client';

/**
 * LifeTreePreview —— 数字生命中心小卡片里的"生命成长仪表"
 *
 * 设计变更（图四要求）：
 * - 移除原本的 SVG 有机树可视化，改成清晰的"数据仪表"形态
 * - 聚焦三个真实数据源：记忆 / 访谈 / 时间胶囊
 * - 顶部：当前成长阶段徽章 + 阶段图标 + 阶段进度环
 * - 中部：三条数据条（记忆·访谈·胶囊），每条显示数字 + 进度
 * - 底部：距离下一阶段的差距 / 或已达永恒
 * - 保留 getTreeStage 供其他页面复用，接口向后兼容
 */

import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { BookOpen, MessageCircle, Package, Sparkles, Sprout, Flower2, TreePine, Leaf, CircleDot, Infinity as InfinityIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ============================================================================
 * 成长阶段定义
 * ========================================================================== */

const STAGES = [
  { id: 'seed', label: '种子期', min: 0, max: 1, icon: CircleDot, color: 'var(--color-gray-400)' },
  { id: 'sprout', label: '萌芽期', min: 1, max: 5, icon: Sprout, color: 'var(--color-success)' },
  { id: 'young', label: '成长期', min: 5, max: 15, icon: Leaf, color: 'var(--color-family-child)' },
  { id: 'mature', label: '繁茂期', min: 15, max: 30, icon: TreePine, color: 'var(--color-primary)' },
  { id: 'bloom', label: '开花期', min: 30, max: 60, icon: Flower2, color: 'var(--color-rose)' },
  { id: 'fruit', label: '结果期', min: 60, max: 100, icon: Sparkles, color: 'var(--color-highlight)' },
  { id: 'eternal', label: '永恒期', min: 100, max: 100, icon: InfinityIcon, color: 'var(--color-purple)' },
] as const;

export type TreeStageId = (typeof STAGES)[number]['id'];

export interface TreeStageInfo {
  id: TreeStageId;
  label: string;
  stageIndex: number;
  progress: number;
  remaining: number;
  score: number;
}

/**
 * 根据真实数据计算生命树成长阶段与进度。
 * 成长点 = memories + interviews × 2 + capsules × 3
 */
export function getTreeStage(
  memories: number,
  interviews: number,
  capsules: number,
): TreeStageInfo {
  const score = memories + interviews * 2 + capsules * 3;

  let stageIndex = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (score >= STAGES[i].min) {
      stageIndex = i;
    }
  }

  const stage = STAGES[stageIndex];
  const isMax = stageIndex === STAGES.length - 1;
  const progress = isMax
    ? 100
    : Math.min(99, Math.max(0, ((score - stage.min) / (stage.max - stage.min)) * 100));
  const remaining = isMax ? 0 : Math.max(0, Math.ceil(stage.max - score));

  return {
    id: stage.id,
    label: stage.label,
    stageIndex,
    progress,
    remaining,
    score,
  };
}

/* ============================================================================
 * 组件 Props
 * ========================================================================== */

export interface LifeTreePreviewProps {
  memories: number;
  interviews: number;
  capsules: number;
  className?: string;
}

/* ============================================================================
 * 内部：数据条
 * ========================================================================== */

interface DataRowProps {
  icon: LucideIcon;
  label: string;
  value: number;
  /** 用于条形填充比例的分母，超出按 100% 显示 */
  target: number;
  color: string;
  delay?: number;
  reducedMotion: boolean;
}

function DataRow({ icon: Icon, label, value, target, color, delay = 0, reducedMotion }: DataRowProps) {
  const percent = Math.min(100, target === 0 ? 0 : (value / target) * 100);

  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
        }}
        aria-hidden
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-2xs text-text-subtle">{label}</span>
          <span className="text-xs font-semibold tabular-nums text-text">
            {value.toLocaleString()}
          </span>
        </div>
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 6%, transparent)' }}
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} 进度 ${Math.round(percent)}%`}
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              backgroundImage: `linear-gradient(90deg, ${color} 0%, color-mix(in srgb, ${color} 60%, transparent) 100%)`,
              boxShadow: `0 0 8px color-mix(in srgb, ${color} 30%, transparent)`,
            }}
            initial={reducedMotion ? { width: `${percent}%` } : { width: '0%' }}
            animate={{ width: `${percent}%` }}
            transition={reducedMotion ? { duration: 0 } : { duration: 1.1, delay, ease: EASE }}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 主组件
 * ========================================================================== */

export default function LifeTreePreview({
  memories,
  interviews,
  capsules,
  className,
}: LifeTreePreviewProps): JSX.Element {
  const stageInfo = useMemo(
    () => getTreeStage(memories, interviews, capsules),
    [memories, interviews, capsules],
  );

  const stage = STAGES[stageInfo.stageIndex];
  const StageIcon = stage.icon;
  const stageColor = stage.color;

  const shouldReduceMotion = useReducedMotion();
  const reducedMotion = Boolean(shouldReduceMotion);
  const ringId = useId();

  // 阶段进度环参数
  const RING_SIZE = 68;
  const RING_STROKE = 5;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - stageInfo.progress / 100);

  const nextStage = STAGES[Math.min(stageInfo.stageIndex + 1, STAGES.length - 1)];

  return (
    <div
      className={cn(
        'relative flex h-full min-h-40 w-full flex-col justify-between overflow-hidden rounded-2xl p-4',
        className,
      )}
      role="img"
      aria-label={`生命成长仪表：当前 ${stage.label}，进度 ${Math.round(stageInfo.progress)}%`}
    >
      {/* 顶部：阶段徽章 + 阶段进度环 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-3xs font-medium"
            style={{
              color: stageColor,
              backgroundColor: `color-mix(in srgb, ${stageColor} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${stageColor} 22%, transparent)`,
            }}
          >
            <StageIcon size={11} />
            <span>{stage.label}</span>
          </div>
          <div className="mt-2 text-2xl font-display font-semibold tabular-nums text-text leading-none">
            {stageInfo.score}
            <span className="ml-1 text-2xs font-normal text-text-subtle">成长点</span>
          </div>
          <div className="mt-1 text-3xs text-text-subtle">
            {stageInfo.stageIndex === STAGES.length - 1
              ? '已达永恒 · 生命循环'
              : `距 ${nextStage.label} 还差 ${stageInfo.remaining}`}
          </div>
        </div>

        {/* 阶段进度环 */}
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
            <defs>
              <linearGradient id={`ring-${ringId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={stageColor} stopOpacity="1" />
                <stop offset="100%" stopColor={stageColor} stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              fill="none"
              stroke="color-mix(in srgb, var(--color-text) 8%, transparent)"
              strokeWidth={RING_STROKE}
            />
            <motion.circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              fill="none"
              stroke={`url(#ring-${ringId})`}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={reducedMotion ? { strokeDashoffset: dashOffset } : { strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={reducedMotion ? { duration: 0 } : { duration: 1.2, ease: EASE }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold tabular-nums text-text">
              {Math.round(stageInfo.progress)}
              <span className="text-3xs text-text-subtle">%</span>
            </span>
          </div>
        </div>
      </div>

      {/* 中部：三条数据 */}
      <div className="mt-4 space-y-2.5">
        <DataRow
          icon={BookOpen}
          label="记忆"
          value={memories}
          target={Math.max(40, memories)}
          color="var(--color-family-child)"
          delay={0}
          reducedMotion={reducedMotion}
        />
        <DataRow
          icon={MessageCircle}
          label="访谈"
          value={interviews}
          target={Math.max(20, interviews)}
          color="var(--color-family-mother)"
          delay={0.1}
          reducedMotion={reducedMotion}
        />
        <DataRow
          icon={Package}
          label="时间胶囊"
          value={capsules}
          target={Math.max(12, capsules)}
          color="var(--color-highlight)"
          delay={0.2}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* 微光装饰：阶段色的模糊光斑 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${stageColor} 30%, transparent) 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}
