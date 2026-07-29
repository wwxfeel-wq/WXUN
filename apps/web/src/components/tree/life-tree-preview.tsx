'use client';

/**
 * LifeTreePreview —— 数字生命中心小卡片里的有机家庭生命树预览
 *
 * 设计要点：
 * 1. 使用轻量 SVG 绘制有机树形：树干、主枝、树叶、花、果实。
 * 2. 成长阶段与进度由真实数据（memories / interviews / capsules）计算。
 * 3. 颜色全部引用 design tokens。
 * 4. 无神经网络、无 ECG、无突触闪光，仅保留柔和的呼吸与摇曳动画。
 * 5. 外层由父级 GlassLayer 统一处理液态玻璃高光。
 */

import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { cn } from '@/lib/utils';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ============================================================================
 * 成长阶段定义
 * ========================================================================== */

const STAGES = [
  { id: 'seed', label: '种子期', min: 0, max: 1 },
  { id: 'sprout', label: '萌芽期', min: 1, max: 5 },
  { id: 'young', label: '成长期', min: 5, max: 15 },
  { id: 'mature', label: '繁茂期', min: 15, max: 30 },
  { id: 'bloom', label: '开花期', min: 30, max: 60 },
  { id: 'fruit', label: '结果期', min: 60, max: 100 },
  { id: 'eternal', label: '永恒期', min: 100, max: 100 },
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
 * 有机预览树生成
 * ========================================================================== */

interface PreviewBranch {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  level: number;
  familyIndex: number | null;
}

interface PreviewLeaf {
  x: number;
  y: number;
  r: number;
  color: string;
  delay: number;
}

interface PreviewFlower {
  x: number;
  y: number;
  r: number;
  delay: number;
}

interface PreviewFruit {
  x: number;
  y: number;
  r: number;
  delay: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILY_COLORS = [
  'var(--color-family-father)',
  'var(--color-family-mother)',
  'var(--color-family-child)',
  'var(--color-family-elder)',
  'var(--color-family-pet)',
];

function generatePreviewTree(stageIndex: number, memories: number, capsules: number, seed: number) {
  const rng = mulberry32(seed);
  const branches: PreviewBranch[] = [];
  const leaves: PreviewLeaf[] = [];
  const flowers: PreviewFlower[] = [];
  const fruits: PreviewFruit[] = [];

  const trunkX = 50;
  const groundY = 88;
  const trunkHeight = 34 + stageIndex * 5;
  const trunkTopY = groundY - trunkHeight;

  // 树干
  branches.push({
    id: 0,
    x1: trunkX,
    y1: groundY,
    x2: trunkX + (rng() - 0.5) * 4,
    y2: trunkTopY,
    cx: trunkX + (rng() - 0.5) * 8,
    cy: groundY - trunkHeight * 0.5,
    level: 0,
    familyIndex: null,
  });

  // 主枝：阶段越高主枝越多
  const mainCount = Math.max(2, Math.min(6, stageIndex + 2));
  for (let i = 0; i < mainCount; i++) {
    const t = 0.35 + 0.45 * (i / Math.max(1, mainCount - 1));
    const sx = trunkX;
    const sy = groundY - trunkHeight * t;
    const dir = (i / Math.max(1, mainCount - 1)) * Math.PI - Math.PI;
    const len = 16 + rng() * 10 + stageIndex * 2;
    const x2 = sx + Math.cos(dir) * len;
    const y2 = sy + Math.sin(dir) * len * 0.65;
    const cx = sx + Math.cos(dir) * len * 0.5 + (rng() - 0.5) * 6;
    const cy = sy + Math.sin(dir) * len * 0.3;

    branches.push({
      id: branches.length,
      x1: sx,
      y1: sy,
      x2,
      y2,
      cx,
      cy,
      level: 1,
      familyIndex: i % FAMILY_COLORS.length,
    });

    // 子枝
    const childCount = stageIndex >= 3 ? 2 : stageIndex >= 1 ? 1 : 0;
    for (let c = 0; c < childCount; c++) {
      const childDir = dir + (rng() - 0.5) * 0.8;
      const childLen = len * (0.55 + rng() * 0.2);
      const x1 = x2;
      const y1 = y2;
      const cx2 = x1 + Math.cos(childDir) * childLen * 0.5 + (rng() - 0.5) * 4;
      const cy2 = y1 + Math.sin(childDir) * childLen * 0.3;
      const x22 = x1 + Math.cos(childDir) * childLen;
      const y22 = y1 + Math.sin(childDir) * childLen * 0.7;
      branches.push({
        id: branches.length,
        x1,
        y1,
        x2: x22,
        y2: y22,
        cx: cx2,
        cy: cy2,
        level: 2,
        familyIndex: i % FAMILY_COLORS.length,
      });
    }
  }

  // 叶子数量随记忆增加
  const leafCount = Math.min(48, Math.max(4, Math.floor(memories * 0.15) + stageIndex * 6));
  const leafBranches = branches.filter((b) => b.level >= 1);
  for (let i = 0; i < leafCount && leafBranches.length > 0; i++) {
    const b = leafBranches[Math.floor(rng() * leafBranches.length)];
    const t = 0.5 + rng() * 0.5;
    const x = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.cx + t * t * b.x2;
    const y = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.cy + t * t * b.y2;
    const color = b.familyIndex !== null ? FAMILY_COLORS[b.familyIndex % FAMILY_COLORS.length] : 'var(--color-tree-leaf)';
    leaves.push({ x, y, r: 1.4 + rng() * 1.2, color, delay: rng() * 2 });
  }

  // 花朵数量随阶段
  const flowerCount = stageIndex >= 3 ? Math.min(12, stageIndex * 2 + Math.floor(memories / 40)) : 0;
  for (let i = 0; i < flowerCount && leafBranches.length > 0; i++) {
    const b = leafBranches[Math.floor(rng() * leafBranches.length)];
    const t = 0.4 + rng() * 0.4;
    const x = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.cx + t * t * b.x2;
    const y = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.cy + t * t * b.y2;
    flowers.push({ x, y, r: 2 + rng(), delay: rng() * 2 });
  }

  // 果实数量随时间胶囊
  const fruitCount = stageIndex >= 4 ? Math.min(14, capsules + Math.floor(stageIndex / 2)) : 0;
  for (let i = 0; i < fruitCount && leafBranches.length > 0; i++) {
    const b = leafBranches[Math.floor(rng() * leafBranches.length)];
    const t = 0.55 + rng() * 0.35;
    const x = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.cx + t * t * b.x2;
    const y = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.cy + t * t * b.y2;
    fruits.push({ x, y, r: 1.8 + rng() * 0.8, delay: rng() * 2 });
  }

  return { branches, leaves, flowers, fruits, trunkX, trunkTopY, groundY };
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
  const { stageIndex } = useMemo(
    () => getTreeStage(memories, interviews, capsules),
    [memories, interviews, capsules],
  );

  const seed = useMemo(() => 20240725 + memories + interviews + capsules, [memories, interviews, capsules]);
  const tree = useMemo(
    () => generatePreviewTree(stageIndex, memories, capsules, seed),
    [stageIndex, memories, capsules, seed],
  );

  const gradientId = useId();
  const shouldReduceMotion = useReducedMotion();
  const motionProps = shouldReduceMotion
    ? { initial: false, animate: false }
    : undefined;

  return (
    <div className={cn(className, 'w-full h-full min-h-40')}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="有机家庭生命树预览"
        className="w-full h-full"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="88%" r="60%">
            <stop offset="0%" stopColor="var(--color-tree-root-glow)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-bg)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 根部柔光 */}
        <ellipse cx={tree.trunkX} cy={tree.groundY} rx="28" ry="10" fill={`url(#${gradientId})`} />

        {/* 树干生命节律微光 */}
        <motion.path
          d={`M ${tree.trunkX} ${tree.groundY} Q ${tree.trunkX + 2} ${(tree.groundY + tree.trunkTopY) / 2} ${tree.trunkX} ${tree.trunkTopY}`}
          fill="none"
          stroke="var(--color-tree-neural)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ opacity: 0.03 }}
          animate={{ opacity: [0.03, 0.1, 0.03] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          {...motionProps}
        />

        {/* 树枝 */}
        <g>
          {tree.branches.map((b) => {
            const color = b.familyIndex !== null
              ? FAMILY_COLORS[b.familyIndex % FAMILY_COLORS.length]
              : 'var(--color-tree-trunk)';
            return (
              <motion.path
                key={b.id}
                d={`M ${b.x1} ${b.y1} Q ${b.cx} ${b.cy} ${b.x2} ${b.y2}`}
                fill="none"
                stroke={color}
                strokeWidth={b.level === 0 ? 3.2 : 1.6}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: b.level === 0 ? 0.9 : 0.75 }}
                transition={{ duration: 1.2, ease: EASE, delay: b.level * 0.15 }}
                {...motionProps}
              />
            );
          })}
        </g>

        {/* 树叶 */}
        <g>
          {tree.leaves.map((leaf, i) => (
            <motion.ellipse
              key={`leaf-${i}`}
              cx={leaf.x}
              cy={leaf.y}
              rx={leaf.r * 0.7}
              ry={leaf.r}
              fill={leaf.color}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 1.08, 1],
                opacity: [0.75, 0.9, 0.75],
                rotate: [0, 4, -4, 0],
              }}
              transition={{
                scale: { duration: 3 + leaf.delay, repeat: Infinity, ease: 'easeInOut' },
                opacity: { duration: 3 + leaf.delay, repeat: Infinity, ease: 'easeInOut' },
                rotate: { duration: 5 + leaf.delay, repeat: Infinity, ease: 'easeInOut' },
              }}
              {...motionProps}
            />
          ))}
        </g>

        {/* 花朵 */}
        <g>
          {tree.flowers.map((flower, i) => (
            <motion.g key={`flower-${i}`}>
              {[0, 1, 2, 3, 4].map((petal) => {
                const angle = (petal / 5) * Math.PI * 2;
                const px = flower.x + Math.cos(angle) * flower.r;
                const py = flower.y + Math.sin(angle) * flower.r;
                return (
                  <motion.circle
                    key={petal}
                    cx={px}
                    cy={py}
                    r={flower.r * 0.55}
                    fill="var(--color-tree-flower)"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.95, 0.8] }}
                    transition={{ duration: 3 + flower.delay, repeat: Infinity, ease: 'easeInOut' }}
                    {...motionProps}
                  />
                );
              })}
            </motion.g>
          ))}
        </g>

        {/* 果实 */}
        <g>
          {tree.fruits.map((fruit, i) => (
            <motion.circle
              key={`fruit-${i}`}
              cx={fruit.x}
              cy={fruit.y}
              r={fruit.r}
              fill="var(--color-tree-fruit)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1, 1.08, 1], opacity: 0.9 }}
              transition={{ duration: 3 + fruit.delay, repeat: Infinity, ease: 'easeInOut' }}
              {...motionProps}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
