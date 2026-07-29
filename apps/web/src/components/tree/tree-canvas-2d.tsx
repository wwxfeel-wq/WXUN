'use client';

/**
 * TreeCanvas2D —— WebGL 不可用时的 2D Canvas 降级方案
 *
 * 视觉方向：有机家庭生命树
 * - 树根：长期记忆 / 知识库密度
 * - 树干：成长年轮与生命节律
 * - 主枝：家庭成员（每人一条主枝，继承家庭色）
 * - 叶片：家庭故事 / 记忆密度
 * - 花：纪念日 / 里程碑
 * - 果实：时间胶囊
 * - 树液：沿枝干缓慢流动的柔和光泽
 * - 无 ECG、无神经网络、无突触闪光、无过度发光
 */

import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { GrowthStage, FamilyMember } from './living-tree-3d';

/* ═══════════════ 常量 ═══════════════ */

const BG_COLOR = 'var(--color-bg)';
const BARK_COLOR = 'var(--color-tree-trunk)';
const ROOT_COLOR = 'var(--color-tree-root)';
const LEAF_BASE = 'var(--color-tree-leaf)';
const FLOWER_BASE = 'var(--color-tree-flower)';
const FRUIT_BASE = 'var(--color-tree-fruit)';
const SAP_COLOR = 'var(--color-tree-sap)';
const INNER_GLOW_COLOR = 'var(--color-tree-neural)';

interface StageParams {
  trunkHeight: number;
  maxLevel: number;
  branchFactor: number;
  baseLeafCount: number;
  baseFlowerCount: number;
  baseFruitCount: number;
  rootCount: number;
  rootDepth: number;
}

const STAGE_PARAMS: Record<GrowthStage, StageParams> = {
  seed: { trunkHeight: 0.35, maxLevel: 0, branchFactor: 0, baseLeafCount: 0, baseFlowerCount: 0, baseFruitCount: 0, rootCount: 4, rootDepth: 1 },
  sprout: { trunkHeight: 0.6, maxLevel: 2, branchFactor: 2, baseLeafCount: 40, baseFlowerCount: 0, baseFruitCount: 0, rootCount: 6, rootDepth: 2 },
  young: { trunkHeight: 0.9, maxLevel: 3, branchFactor: 2, baseLeafCount: 160, baseFlowerCount: 12, baseFruitCount: 0, rootCount: 10, rootDepth: 2 },
  mature: { trunkHeight: 1.15, maxLevel: 4, branchFactor: 3, baseLeafCount: 340, baseFlowerCount: 30, baseFruitCount: 10, rootCount: 14, rootDepth: 3 },
  bloom: { trunkHeight: 1.25, maxLevel: 5, branchFactor: 3, baseLeafCount: 460, baseFlowerCount: 70, baseFruitCount: 24, rootCount: 16, rootDepth: 3 },
  fruit: { trunkHeight: 1.3, maxLevel: 5, branchFactor: 3, baseLeafCount: 520, baseFlowerCount: 90, baseFruitCount: 55, rootCount: 16, rootDepth: 3 },
  eternal: { trunkHeight: 1.4, maxLevel: 5, branchFactor: 3, baseLeafCount: 600, baseFlowerCount: 110, baseFruitCount: 90, rootCount: 18, rootDepth: 4 },
};

/* ═══════════════ 工具 ═══════════════ */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveColor(value: string): string {
  if (typeof document === 'undefined') return value;
  const m = value.match(/^var\((--[^)]+)\)$/);
  if (!m) return value;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || value;
}

function bezierPoint2D(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  t: number,
) {
  const it = 1 - t;
  return {
    x: it * it * x1 + 2 * it * t * cx + t * t * x2,
    y: it * it * y1 + 2 * it * t * cy + t * t * y2,
  };
}

interface Branch2D {
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  thickness: number;
  level: number;
  familyIndex: number | null;
  angle: number;
  length: number;
}

interface Leaf2D {
  x: number; y: number;
  size: number;
  color: string;
  alpha: number;
  phase: number;
}

interface Flower2D {
  x: number; y: number;
  size: number;
  color: string;
  phase: number;
}

interface Fruit2D {
  x: number; y: number;
  size: number;
  color: string;
  phase: number;
}

interface SapParticle2D {
  branchIdx: number;
  offset: number;
  speed: number;
  size: number;
  phase: number;
}

interface Root2D {
  x1: number; y1: number;
  x2: number; y2: number;
  cx: number; cy: number;
  thickness: number;
}

interface TreeData2D {
  branches: Branch2D[];
  leaves: Leaf2D[];
  flowers: Flower2D[];
  fruits: Fruit2D[];
  roots: Root2D[];
  sapParticles: SapParticle2D[];
  trunkPath: { x: number; y: number }[];
  trunkThickness: number;
  scale: number;
  stage: StageParams;
  familyColors: string[];
}

/* ═══════════════ 生成 ═══════════════ */

function generateTree2D(
  stage: StageParams,
  family: FamilyMember[],
  storyCount: number,
  timeCapsuleCount: number,
  milestoneCount: number,
  knowledgeRootCount: number,
  width: number,
  height: number,
): TreeData2D {
  const rng = mulberry32(20240607);
  const cx = width / 2;
  const groundY = height * 0.78;
  const scale = Math.min(width, height) * 0.32;
  const H = stage.trunkHeight * scale;

  const familyColors = family.map((f) => resolveColor(f.color));

  const branches: Branch2D[] = [];
  const leaves: Leaf2D[] = [];
  const flowers: Flower2D[] = [];
  const fruits: Fruit2D[] = [];
  const roots: Root2D[] = [];
  const sapParticles: SapParticle2D[] = [];

  /* ── 树干（S 型扭曲）── */
  const bendX = (rng() - 0.5) * 0.3 * scale;
  const trunkPath = [
    { x: cx, y: groundY },
    { x: cx + bendX * 0.4, y: groundY - H * 0.33 },
    { x: cx - bendX * 0.3, y: groundY - H * 0.66 },
    { x: cx + bendX * 0.15, y: groundY - H },
  ];
  const trunkThickness = Math.max(4, scale * 0.05);
  const trunkEndAngle = -Math.PI / 2 + (bendX * 0.15) / H;

  branches.push({
    x1: trunkPath[0].x, y1: trunkPath[0].y,
    x2: trunkPath[3].x, y2: trunkPath[3].y,
    x3: trunkPath[1].x, y3: trunkPath[1].y,
    thickness: trunkThickness,
    level: 0,
    familyIndex: null,
    angle: trunkEndAngle,
    length: H,
  });

  /* ── 主枝：每位家庭成员一条主枝 ── */
  const mainCount = stage.maxLevel >= 1 ? Math.max(1, family.length) : 0;
  for (let i = 0; i < mainCount; i++) {
    const ang = (i / Math.max(1, mainCount)) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const t = 0.5 + 0.42 * (i / Math.max(1, mainCount)) + (rng() - 0.5) * 0.05;
    const p0 = trunkPath[0];
    const p1 = trunkPath[1];
    const p2 = trunkPath[2];
    const p3 = trunkPath[3];
    const mt = 1 - t;
    const sx = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    const sy = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;

    const branchAngle = -Math.PI / 2 + (ang - Math.PI) * 0.6 + (rng() - 0.5) * 0.3;
    const len = H * (0.55 + rng() * 0.25);
    const endX = sx + Math.cos(branchAngle) * len;
    const endY = sy + Math.sin(branchAngle) * len;
    const ctrlX = sx + Math.cos(branchAngle) * len * 0.5 + (rng() - 0.5) * len * 0.15;
    const ctrlY = sy + Math.sin(branchAngle) * len * 0.5 + (rng() - 0.5) * len * 0.1;

    const branch: Branch2D = {
      x1: sx, y1: sy,
      x2: endX, y2: endY,
      x3: ctrlX, y3: ctrlY,
      thickness: trunkThickness * 0.45 * (0.7 + rng() * 0.15),
      level: 1,
      familyIndex: i,
      angle: branchAngle,
      length: len,
    };
    branches.push(branch);
    growBranches2D(branch, stage, rng, branches, 1);
  }

  /* ── 递归子枝 ── */
  function growBranches2D(
    parent: Branch2D,
    st: StageParams,
    rnd: () => number,
    out: Branch2D[],
    currentLevel: number,
  ) {
    const nextLevel = currentLevel + 1;
    if (nextLevel > st.maxLevel || st.branchFactor === 0) return;
    const childCount =
      st.branchFactor === 2
        ? rnd() < 0.5 ? 1 : 2
        : nextLevel <= 2 ? (rnd() < 0.3 ? 4 : 3) : (rnd() < 0.5 ? 2 : 3);

    for (let c = 0; c < childCount; c++) {
      const angleOffset = (rnd() - 0.5) * Math.PI * 0.45;
      const childAngle = parent.angle + angleOffset;
      const upBias = nextLevel <= 2 ? 0.25 : nextLevel === 3 ? 0.1 : 0.0;
      const finalAngle = childAngle + (-Math.PI / 2 - childAngle) * upBias * 0.3;
      const len = parent.length * (0.7 + rnd() * 0.15);
      const endX = parent.x2 + Math.cos(finalAngle) * len;
      const endY = parent.y2 + Math.sin(finalAngle) * len;
      const ctrlX = parent.x2 + Math.cos(finalAngle) * len * 0.5 + (rnd() - 0.5) * len * 0.2;
      const ctrlY = parent.y2 + Math.sin(finalAngle) * len * 0.5 + (rnd() - 0.5) * len * 0.1;

      const child: Branch2D = {
        x1: parent.x2, y1: parent.y2,
        x2: endX, y2: endY,
        x3: ctrlX, y3: ctrlY,
        thickness: parent.thickness * (0.6 + rnd() * 0.12),
        level: nextLevel,
        familyIndex: parent.familyIndex,
        angle: finalAngle,
        length: len,
      };
      out.push(child);
      growBranches2D(child, st, rnd, out, nextLevel);
    }
  }

  /* ── 树叶：故事 / 记忆密度 ── */
  const storyDensity = Math.min(1, 0.15 + storyCount / 600);
  const targetLeafCount = Math.floor(stage.baseLeafCount * storyDensity);
  const spawnBranches = branches.filter((b) => b.level >= 2 && b.familyIndex !== null);
  if (targetLeafCount > 0 && spawnBranches.length > 0) {
    for (let i = 0; i < targetLeafCount; i++) {
      const b = spawnBranches[Math.floor(rng() * spawnBranches.length)];
      const t = 0.6 + rng() * 0.4;
      const lx = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.x3 + t * t * b.x2;
      const ly = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.y3 + t * t * b.y2;
      const jitter = 8;
      const familyColor = b.familyIndex !== null ? familyColors[b.familyIndex % familyColors.length] : undefined;
      leaves.push({
        x: lx + (rng() - 0.5) * jitter,
        y: ly + (rng() - 0.5) * jitter,
        size: 1.5 + rng() * 3,
        color: familyColor ?? resolveColor(LEAF_BASE),
        alpha: 0.35 + rng() * 0.45,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  /* ── 花：纪念日 / 里程碑 ── */
  const milestoneDensity = Math.min(1, 0.12 + milestoneCount / 80);
  const targetFlowerCount = Math.floor(stage.baseFlowerCount * milestoneDensity);
  if (targetFlowerCount > 0 && spawnBranches.length > 0) {
    for (let i = 0; i < targetFlowerCount; i++) {
      const b = spawnBranches[Math.floor(rng() * spawnBranches.length)];
      const t = 0.5 + rng() * 0.45;
      const fx = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.x3 + t * t * b.x2;
      const fy = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.y3 + t * t * b.y2;
      flowers.push({
        x: fx + (rng() - 0.5) * 6,
        y: fy + (rng() - 0.5) * 6,
        size: 2 + rng() * 2,
        color: resolveColor(FLOWER_BASE),
        phase: rng() * Math.PI * 2,
      });
    }
  }

  /* ── 果实：时间胶囊 ── */
  const capsuleDensity = Math.min(1, 0.12 + timeCapsuleCount / 60);
  const targetFruitCount = Math.floor(stage.baseFruitCount * capsuleDensity);
  if (targetFruitCount > 0 && spawnBranches.length > 0) {
    for (let i = 0; i < targetFruitCount; i++) {
      const b = spawnBranches[Math.floor(rng() * spawnBranches.length)];
      const t = 0.55 + rng() * 0.35;
      const fx = (1 - t) * (1 - t) * b.x1 + 2 * (1 - t) * t * b.x3 + t * t * b.x2;
      const fy = (1 - t) * (1 - t) * b.y1 + 2 * (1 - t) * t * b.y3 + t * t * b.y2;
      fruits.push({
        x: fx + (rng() - 0.5) * 5,
        y: fy + (rng() - 0.5) * 5,
        size: 2.5 + rng() * 2,
        color: resolveColor(FRUIT_BASE),
        phase: rng() * Math.PI * 2,
      });
    }
  }

  /* ── 树液：沿主要枝干缓慢流动 ── */
  const maxSap = Math.min(40, Math.max(0, Math.floor(branches.length * 0.6)));
  for (let i = 0; i < maxSap; i++) {
    const branchIdx = Math.floor(rng() * branches.length);
    const b = branches[branchIdx];
    if (!b || b.level === 0) continue;
    sapParticles.push({
      branchIdx,
      offset: rng(),
      speed: 0.03 + rng() * 0.04,
      size: 1 + rng() * 1.2,
      phase: rng() * Math.PI * 2,
    });
  }

  /* ── 树根：长期记忆 / Knowledge Root 密度 ── */
  const rootDensity = Math.min(1.5, 0.4 + knowledgeRootCount / 300);
  const rootCount = Math.min(26, Math.max(4, Math.floor(stage.rootCount * rootDensity)));
  function growRoots2D(
    startX: number, startY: number,
    angle: number, length: number,
    thickness: number,
    depth: number, maxDepth: number,
    rnd: () => number,
  ) {
    if (depth > maxDepth) return;
    const endX = startX + Math.cos(angle) * length;
    const endY = startY + Math.sin(angle) * length;
    const ctrlX = startX + Math.cos(angle) * length * 0.5 + (rnd() - 0.5) * length * 0.3;
    const ctrlY = startY + Math.sin(angle) * length * 0.5 + (rnd() - 0.5) * length * 0.1;

    roots.push({ x1: startX, y1: startY, x2: endX, y2: endY, cx: ctrlX, cy: ctrlY, thickness });

    const childCount = rnd() < 0.5 ? 1 : 2;
    for (let c = 0; c < childCount; c++) {
      const childAngle = angle + (rnd() - 0.5) * 0.8;
      const downBias = (Math.PI / 2 - childAngle) * 0.3;
      growRoots2D(endX, endY, childAngle + downBias, length * (0.65 + rnd() * 0.15), thickness * 0.6, depth + 1, maxDepth, rnd);
    }
  }

  for (let i = 0; i < rootCount; i++) {
    const ang = (i / rootCount) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const startAngle = Math.PI / 2 + (ang - Math.PI) * 0.5;
    const len = scale * (0.25 + rng() * 0.25);
    growRoots2D(cx, groundY, startAngle, len, trunkThickness * 0.5, 0, stage.rootDepth, rng);
  }

  return {
    branches,
    leaves,
    flowers,
    fruits,
    roots,
    sapParticles,
    trunkPath,
    trunkThickness,
    scale,
    stage,
    familyColors,
  };
}

/* ═══════════════ 组件 ═══════════════ */

export interface TreeCanvas2DProps {
  growthStage?: GrowthStage;
  familyMembers?: FamilyMember[];
  memoryCount?: number;
  storyCount?: number;
  timeCapsuleCount?: number;
  milestoneCount?: number;
  knowledgeRootCount?: number;
  className?: string;
}

export default function TreeCanvas2D({
  growthStage = 'mature',
  familyMembers,
  memoryCount = 0,
  storyCount = memoryCount,
  timeCapsuleCount = 0,
  milestoneCount = 0,
  knowledgeRootCount = memoryCount,
  className,
}: TreeCanvas2DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<TreeData2D | null>(null);
  const animRef = useRef<number>(0);

  const defaultFamily: FamilyMember[] = [
    { id: 'father', name: '爸爸', color: 'var(--color-family-father)' },
    { id: 'mother', name: '妈妈', color: 'var(--color-family-mother)' },
    { id: 'child', name: '孩子', color: 'var(--color-family-child)' },
    { id: 'elder', name: '老人', color: 'var(--color-family-elder)' },
    { id: 'pet', name: '宠物', color: 'var(--color-family-pet)' },
  ];
  const family = familyMembers && familyMembers.length > 0 ? familyMembers : defaultFamily;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const stage = STAGE_PARAMS[growthStage];
      dataRef.current = generateTree2D(
        stage,
        family,
        storyCount,
        timeCapsuleCount,
        milestoneCount,
        knowledgeRootCount,
        w,
        h,
      );
      if (reducedMotion) {
        drawFrame(0);
      }
    };

    const drawFrame = (time: number) => {
      const data = dataRef.current;
      if (!data) {
        animRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = time * 0.001;

      // 柔和背景
      const bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, 'var(--color-bg-elevated)');
      bgGrad.addColorStop(1, BG_COLOR);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const groundY = h * 0.78;
      const swayX = Math.sin(t * 0.5) * 3;

      // ── 根部环境辉光 ──
      const rootGlow = ctx.createRadialGradient(w / 2, groundY, 0, w / 2, groundY, 120);
      rootGlow.addColorStop(0, 'var(--color-tree-root-glow)');
      rootGlow.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rootGlow;
      ctx.beginPath();
      ctx.arc(w / 2, groundY, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // ── 树根 ──
      for (const r of data.roots) {
        ctx.strokeStyle = ROOT_COLOR;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(0.5, r.thickness * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r.x1, r.y1);
        ctx.quadraticCurveTo(r.cx, r.cy, r.x2, r.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // ── 树干生命节律：树皮内部柔和微光 ──
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.8 + 0.5);
      ctx.strokeStyle = INNER_GLOW_COLOR;
      ctx.lineWidth = data.trunkThickness * 0.25;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.04 + 0.04 * breathe;
      ctx.beginPath();
      ctx.moveTo(data.trunkPath[0].x, data.trunkPath[0].y);
      for (let i = 1; i < data.trunkPath.length; i++) {
        const prev = data.trunkPath[i - 1];
        const curr = data.trunkPath[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // ── 枝条 ──
      for (const b of data.branches) {
        let color = BARK_COLOR;
        if (b.familyIndex !== null && data.familyColors.length > 0) {
          color = data.familyColors[b.familyIndex % data.familyColors.length];
        }
        const opacity = b.level === 0 ? 0.92 : Math.max(0.4, 0.85 - b.level * 0.08);
        ctx.strokeStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = Math.max(0.5, b.thickness);
        ctx.lineCap = 'round';

        const offX = b.level > 0 ? swayX * (b.level / data.stage.maxLevel) * 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(b.x1 + (b.level > 0 ? swayX * 0.1 : 0), b.y1);
        ctx.quadraticCurveTo(b.x3 + offX * 0.5, b.y3, b.x2 + offX, b.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // ── 树液流动：沿枝干缓慢穿梭 ──
      ctx.globalCompositeOperation = 'source-over';
      for (const sap of data.sapParticles) {
        const b = data.branches[sap.branchIdx];
        if (!b) continue;
        const p = (t * sap.speed + sap.offset) % 1;
        const envelope = Math.sin(p * Math.PI);
        const offX = b.level > 0 ? swayX * (b.level / data.stage.maxLevel) * 0.5 : 0;
        const pos = bezierPoint2D(
          b.x1 + (b.level > 0 ? swayX * 0.1 : 0), b.y1,
          b.x3 + offX * 0.5, b.y3,
          b.x2 + offX, b.y2,
          p,
        );

        ctx.globalAlpha = 0.35 * envelope;
        ctx.fillStyle = SAP_COLOR;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sap.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── 树叶 ──
      for (const leaf of data.leaves) {
        const twinkle = 0.85 + 0.15 * Math.sin(t * 0.9 + leaf.phase);
        const drift = Math.sin(t * 0.5 + leaf.phase) * 1.5;
        const driftY = Math.cos(t * 0.6 + leaf.phase) * 1;
        const swayOffset = swayX * 0.2;
        const alpha = leaf.alpha * twinkle;
        const r = leaf.size * 2.5;
        const x = leaf.x + drift + swayOffset;
        const y = leaf.y + driftY;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, leaf.color);
        grad.addColorStop(0.5, `color-mix(in srgb, ${leaf.color} 50%, transparent)`);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.6, r, Math.sin(leaf.phase) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 花 ──
      for (const flower of data.flowers) {
        const pulse = 0.85 + 0.15 * Math.sin(t * 0.7 + flower.phase);
        const swayOffset = swayX * 0.25;
        const x = flower.x + swayOffset;
        const y = flower.y;
        const r = flower.size * pulse;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
        grad.addColorStop(0, flower.color);
        grad.addColorStop(1, `color-mix(in srgb, ${flower.color} 20%, transparent)`);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let petal = 0; petal < 5; petal++) {
          const angle = (petal / 5) * Math.PI * 2 + t * 0.1 + flower.phase;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (petal === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }

      // ── 果实 ──
      for (const fruit of data.fruits) {
        const swayOffset = swayX * 0.2;
        const x = fruit.x + swayOffset;
        const y = fruit.y;
        const r = fruit.size;

        const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.6);
        grad.addColorStop(0, `color-mix(in srgb, ${fruit.color} 80%, white)`);
        grad.addColorStop(0.6, fruit.color);
        grad.addColorStop(1, `color-mix(in srgb, ${fruit.color} 40%, transparent)`);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (!reducedMotion) {
        animRef.current = requestAnimationFrame(drawFrame);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    if (!reducedMotion) {
      animRef.current = requestAnimationFrame(drawFrame);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [growthStage, family, memoryCount, storyCount, timeCapsuleCount, milestoneCount, knowledgeRootCount]);

  return (
    <div className={`${className} w-full h-full relative`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="有机家庭生命树：树根代表长期记忆，树干代表成长，枝条代表家庭成员，叶片代表故事，花朵代表里程碑，果实代表时间胶囊"
        className="w-full h-full block"
      />
    </div>
  );
}
