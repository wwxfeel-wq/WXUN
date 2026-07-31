'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 神经元形态粒子 V10 (Neuron Morphology · Visible Filaments)
 * ─────────────────────────────────────────────────────────────
 * 复刻 Bilibili BV1ow4m1Y7qu 粒子神经元效果
 *
 * V10 核心变化：让神经元形态清晰可见
 * - 分支骨架用多层辉光渲染（外晕→中辉→亮芯），不再是几乎不可见的底线
 * - 更真实的神经元结构：10-14 条初级树突 + 4 级分支 + 有机弯曲
 * - 信号脉冲沿分支从胞体向终端传播，形成流动光迹
 * - 粒子紧贴可见分支路径流动，拖尾强化形态
 * - 暖色调温度梯度：白热胞体 → 琥珀中段 → 暗红终端
 * - 3D 透视 + 拖拽旋转 + 惯性 + 双击重置
 */

export type LifeCoreState = 'companion' | 'learning' | 'recalling' | 'growing';

export type NodeKind = 'memory' | 'event' | 'knowledge' | 'agent';

export interface LifeCoreCounts {
  memory: number;
  event: number;
  knowledge: number;
  agent: number;
}

interface LifeCoreCanvasProps {
  state?: LifeCoreState;
  counts: LifeCoreCounts;
  level?: number;
  className?: string;
}

// ═══════════════════════════════════════════
// 神经元分支树结构
// ═══════════════════════════════════════════

interface NeuronBranch {
  id: number;
  parentId: number | null;
  level: number; // 0=初级树突, 1=二级, 2=三级, 3=终端细丝
  points: { x: number; y: number; z: number }[];
  angle: number;
  length: number;
  thickness: number;
  children: number[];
  kind: NodeKind;
  // 预计算的距离比例（0=胞体端, 1=终端端）
  distRatios: number[];
}

interface NeuronParticle {
  branchId: number;
  progress: number;
  speed: number;
  offset: number;
  size: number;
  life: number;
  maxLife: number;
  trail: { x: number; y: number; z: number }[];
  trailMax: number;
  kind: NodeKind;
}

interface SignalPulse {
  branchId: number;
  progress: number;
  speed: number;
  intensity: number;
  life: number;
}

interface BgStar {
  x: number;
  y: number;
  z: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

// ═══════════════════════════════════════════
// 数学工具
// ═══════════════════════════════════════════

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rotY(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}
function rotX(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function curlNoise2D(x: number, y: number, t: number): number {
  return Math.sin(y * 2.0 + t * 0.3) * Math.cos(x * 1.5 + t * 0.2) +
         Math.sin(x * 3.1 + t * 0.5) * 0.3;
}

// ═══════════════════════════════════════════
// 色彩温度梯度 — 暖色调
// ═══════════════════════════════════════════

function tempColor(r: number): [number, number, number] {
  if (r < 0.08) {
    const t = r / 0.08;
    return [255, Math.round(lerp(255, 245, t)), Math.round(lerp(255, 210, t))];
  }
  if (r < 0.25) {
    const t = (r - 0.08) / 0.17;
    return [255, Math.round(lerp(245, 180, t)), Math.round(lerp(210, 90, t))];
  }
  if (r < 0.5) {
    const t = (r - 0.25) / 0.25;
    return [Math.round(lerp(255, 220, t)), Math.round(lerp(180, 100, t)), Math.round(lerp(90, 40, t))];
  }
  if (r < 0.75) {
    const t = (r - 0.5) / 0.25;
    return [Math.round(lerp(220, 160, t)), Math.round(lerp(100, 50, t)), Math.round(lerp(40, 20, t))];
  }
  const t = clamp((r - 0.75) / 0.25, 0, 1);
  return [Math.round(lerp(160, 100, t)), Math.round(lerp(50, 25, t)), Math.round(lerp(20, 10, t))];
}

function kindColor(kind: NodeKind, r: number): [number, number, number] {
  const [cr, cg, cb] = tempColor(r);
  switch (kind) {
    case 'memory':
      return [clamp(cr + 10, 0, 255), clamp(cg + 5, 0, 255), clamp(cb - 15, 0, 255)];
    case 'event':
      return [clamp(cr - 10, 0, 255), clamp(cg - 20, 0, 255), clamp(cb + 25, 0, 255)];
    case 'knowledge':
      return [clamp(cr - 15, 0, 255), clamp(cg, 0, 255), clamp(cb + 35, 0, 255)];
    default:
      return [cr, cg, cb];
  }
}

// ═══════════════════════════════════════════
// 构建神经元分支树 — 更真实的神经元形态
// ═══════════════════════════════════════════

function buildNeuronTree(counts: LifeCoreCounts, level: number): {
  branches: NeuronBranch[];
  particles: NeuronParticle[];
  signals: SignalPulse[];
  bgStars: BgStar[];
} {
  const rand = mulberry32(42 + level * 7);

  const totalCount = counts.memory + counts.event + counts.knowledge + counts.agent;
  const kinds: NodeKind[] = [];
  if (totalCount === 0) {
    for (let i = 0; i < 24; i++) kinds.push('agent');
  } else {
    const ratios = {
      agent: Math.max(0.3, counts.agent / Math.max(1, totalCount)),
      memory: Math.max(0.1, counts.memory / Math.max(1, totalCount)),
      event: Math.max(0.1, counts.event / Math.max(1, totalCount)),
      knowledge: Math.max(0.1, counts.knowledge / Math.max(1, totalCount)),
    };
    const sum = ratios.agent + ratios.memory + ratios.event + ratios.knowledge;
    for (let i = 0; i < 24; i++) {
      const r = rand() * sum;
      let acc = 0;
      for (const [k, v] of Object.entries(ratios) as [NodeKind, number][]) {
        acc += v;
        if (r < acc) { kinds.push(k); break; }
      }
    }
  }

  const branches: NeuronBranch[] = [];
  let branchIdCounter = 0;

  // 递归构建分支 — 更有机的弯曲和更深的层级
  function createBranch(
    parentId: number | null,
    startX: number, startY: number, startZ: number,
    angle: number,
    length: number,
    kind: NodeKind,
    depth: number,
  ): number {
    const id = branchIdCounter++;
    const thickness = depth === 0 ? 1.0 : depth === 1 ? 0.55 : depth === 2 ? 0.3 : 0.15;

    // 更多段数 → 更平滑的曲线
    const segments = 12 + Math.floor(rand() * 6);
    const points: { x: number; y: number; z: number }[] = [];
    let cx = startX, cy = startY, cz = startZ;
    let currentAngle = angle;
    const zDrift = (rand() - 0.5) * 0.025;

    points.push({ x: cx, y: cy, z: cz });

    for (let i = 1; i <= segments; i++) {
      // 有机弯曲：角度逐步偏转，深处分支弯曲更多
      const bendAmount = depth === 0 ? 0.15 : depth === 1 ? 0.22 : 0.3;
      currentAngle += (rand() - 0.5) * bendAmount;
      const segLen = length / segments;
      cx += Math.cos(currentAngle) * segLen;
      cy += Math.sin(currentAngle) * segLen;
      cz += zDrift * (rand() - 0.3);
      points.push({ x: cx, y: cy, z: cz });
    }

    // 预计算每个点到起点的距离比例
    let totalDist = 0;
    const dists: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      totalDist += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y,
        points[i].z - points[i - 1].z,
      );
      dists.push(totalDist);
    }
    const distRatios = dists.map(d => totalDist > 0 ? d / totalDist : 0);

    const branch: NeuronBranch = {
      id,
      parentId,
      level: depth,
      points,
      angle,
      length,
      thickness,
      children: [],
      kind,
      distRatios,
    };
    branches.push(branch);

    // 递归创建子分支 — 4 级深度
    if (depth < 3) {
      const childCount = depth === 0
        ? 3 + Math.floor(rand() * 2) // 初级：3-4 个子分支
        : depth === 1
        ? 2 + Math.floor(rand() * 2) // 二级：2-3
        : 1 + Math.floor(rand() * 2); // 三级：1-2

      const endPoint = points[points.length - 1];
      for (let c = 0; c < childCount; c++) {
        const angleOffset = (c - (childCount - 1) / 2) * (0.45 + rand() * 0.3);
        const childAngle = currentAngle + angleOffset;
        const childLength = length * (0.5 + rand() * 0.25);
        const childKind = kinds[(id + c) % kinds.length] || 'agent';
        const childId = createBranch(
          id, endPoint.x, endPoint.y, endPoint.z,
          childAngle, childLength, childKind, depth + 1,
        );
        branch.children.push(childId);
      }
    }

    return id;
  }

  // 创建初级树突 — 10-14 条主分支从胞体辐射
  const primaryCount = 10 + Math.floor(rand() * 4);
  for (let i = 0; i < primaryCount; i++) {
    const angle = (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const length = 0.38 + rand() * 0.22;
    const kind = kinds[i % kinds.length] || 'agent';
    createBranch(null, 0, 0, 0, angle, length, kind, 0);
  }

  // 创建粒子 — 沿分支流动
  const particles: NeuronParticle[] = [];
  const particlesPerBranch = (branch: NeuronBranch): number => {
    if (branch.level === 0) return 10;
    if (branch.level === 1) return 6;
    if (branch.level === 2) return 4;
    return 2;
  };

  for (const branch of branches) {
    const count = particlesPerBranch(branch);
    for (let i = 0; i < count; i++) {
      particles.push({
        branchId: branch.id,
        progress: rand(),
        speed: 0.0025 + rand() * 0.004,
        offset: 0,
        size: branch.level === 0 ? 1.3 + rand() * 0.5 : 0.9 + rand() * 0.4,
        life: rand() * 200,
        maxLife: 150 + rand() * 200,
        trail: [],
        trailMax: branch.level <= 1 ? 12 + Math.floor(rand() * 6) : 8 + Math.floor(rand() * 4),
        kind: branch.kind,
      });
    }
  }

  // 限制总粒子数
  const maxParticles = Math.min(700, 450 + totalCount * 5 + level * 10);
  if (particles.length > maxParticles) {
    for (let i = particles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [particles[i], particles[j]] = [particles[j], particles[i]];
    }
    particles.length = maxParticles;
  }

  // 创建信号脉冲 — 沿分支从胞体向终端传播
  const signals: SignalPulse[] = [];
  const signalCount = Math.min(30, 15 + Math.floor(totalCount / 10));
  for (let i = 0; i < signalCount; i++) {
    const branch = branches[Math.floor(rand() * branches.length)];
    signals.push({
      branchId: branch.id,
      progress: rand(),
      speed: 0.008 + rand() * 0.012,
      intensity: 0.6 + rand() * 0.4,
      life: rand() * 300,
    });
  }

  // 背景星场
  const bgStars: BgStar[] = [];
  for (let i = 0; i < 100; i++) {
    bgStars.push({
      x: (rand() - 0.5) * 3,
      y: (rand() - 0.5) * 3,
      z: (rand() - 0.5) * 0.5,
      size: 0.3 + rand() * 0.5,
      brightness: 0.03 + rand() * 0.08,
      twinkleSpeed: 0.3 + rand() * 0.9,
      twinklePhase: rand() * Math.PI * 2,
    });
  }

  return { branches, particles, signals, bgStars };
}

// ═══════════════════════════════════════════
// 沿分支路径插值获取位置
// ═══════════════════════════════════════════

function getBranchPosition(
  branch: NeuronBranch,
  progress: number,
  offset: number,
): { x: number; y: number; z: number } {
  const points = branch.points;
  const clampedP = clamp(progress, 0, 1);
  const segCount = points.length - 1;
  const segIdx = Math.min(segCount - 1, Math.floor(clampedP * segCount));
  const segT = clampedP * segCount - segIdx;

  const p0 = points[segIdx];
  const p1 = points[segIdx + 1] || p0;
  const x = lerp(p0.x, p1.x, segT);
  const y = lerp(p0.y, p1.y, segT);
  const z = lerp(p0.z, p1.z, segT);

  const dirX = p1.x - p0.x;
  const dirY = p1.y - p0.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const nx = -dirY / dirLen;
  const ny = dirX / dirLen;

  return { x: x + nx * offset, y: y + ny * offset, z };
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

const DEFAULT_PITCH = -0.35;
const FOCAL_LENGTH = 3.0;

export function LifeCoreCanvas({
  state = 'companion',
  counts,
  level = 1,
  className,
}: LifeCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const reducedMotion = useReducedMotion();
  const [hoverInfo, setHoverInfo] = useState<{ kind: NodeKind; x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const neuron = useMemo(() => buildNeuronTree(counts, level), [counts, level]);
  const neuronRef = useRef(neuron);
  neuronRef.current = neuron;

  const dragRef = useRef({
    isDragging: false,
    lastX: 0, lastY: 0,
    velX: 0, velY: 0,
    pointerId: -1,
  });

  const viewRef = useRef({
    yaw: 0, pitch: DEFAULT_PITCH,
    targetYaw: 0, targetPitch: DEFAULT_PITCH,
  });

  const lastFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const BURST_DURATION = 2.5;
  const screenPositionsRef = useRef<Array<{ kind: NodeKind; sx: number; sy: number }>>([]);

  // 预渲染 sprite
  const [particleSprite, setParticleSprite] = useState<HTMLCanvasElement | null>(null);
  const [coreSprite, setCoreSprite] = useState<HTMLCanvasElement | null>(null);
  const [glowSprite, setGlowSprite] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 粒子光晕 — 暖色
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,240,200,0.7)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.2)');
    grad.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    setParticleSprite(canvas);

    // 核心 sprite — 白热
    const coreSize = 128;
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = coreSize; coreCanvas.height = coreSize;
    const cctx = coreCanvas.getContext('2d')!;
    const coreGrad = cctx.createRadialGradient(coreSize/2, coreSize/2, 0, coreSize/2, coreSize/2, coreSize/2);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.1, 'rgba(255,250,220,0.85)');
    coreGrad.addColorStop(0.25, 'rgba(255,200,100,0.4)');
    coreGrad.addColorStop(0.5, 'rgba(255,140,50,0.15)');
    coreGrad.addColorStop(1, 'rgba(200,80,30,0)');
    cctx.fillStyle = coreGrad;
    cctx.fillRect(0, 0, coreSize, coreSize);
    setCoreSprite(coreCanvas);

    // 背景光晕
    const glowSize = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize; glowCanvas.height = glowSize;
    const gctx = glowCanvas.getContext('2d')!;
    const glowGrad = gctx.createRadialGradient(glowSize/2, glowSize/2, 0, glowSize/2, glowSize/2, glowSize/2);
    glowGrad.addColorStop(0, 'rgba(255,160,60,0.15)');
    glowGrad.addColorStop(0.15, 'rgba(255,140,50,0.1)');
    glowGrad.addColorStop(0.35, 'rgba(220,100,40,0.05)');
    glowGrad.addColorStop(0.65, 'rgba(180,70,30,0.02)');
    glowGrad.addColorStop(1, 'rgba(120,40,15,0)');
    gctx.fillStyle = glowGrad;
    gctx.fillRect(0, 0, glowSize, glowSize);
    setGlowSprite(glowCanvas);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { branches, particles, signals, bgStars } = neuronRef.current;
    if (!branches.length || !particleSprite || !coreSprite || !glowSprite) return;

    const now = performance.now() / 1000;
    if (startTimeRef.current === 0) {
      startTimeRef.current = now;
      lastFrameRef.current = now;
    }
    const dt = Math.min(0.05, now - lastFrameRef.current);
    lastFrameRef.current = now;
    const frame = now;

    const cx = width / 2;
    const cy = height * 0.45;
    const baseScale = Math.min(width, height) * 1.1;

    // 爆发动画
    const elapsed = frame - startTimeRef.current;
    const burstProgress = reducedMotion ? 1 : Math.min(1, elapsed / BURST_DURATION);
    const burstEase = burstProgress === 1 ? 1 : 1 - Math.pow(2, -10 * burstProgress);
    const burstScale = 0.05 + burstEase * 0.95;
    const burstSpin = reducedMotion ? 0 : (1 - burstEase) * 3.0;
    const burstAlpha = reducedMotion ? 1 : Math.min(1, burstProgress * 1.5);

    // 呼吸
    const breath = state === 'companion'
      ? 0.97 + Math.sin(frame * 0.6) * 0.03
      : state === 'learning'
      ? 1.0 + Math.sin(frame * 1.2) * 0.06
      : state === 'recalling'
      ? 0.93 + Math.sin(frame * 1.6) * 0.08
      : 1.04 + Math.sin(frame * 0.5) * 0.05;
    const scale = baseScale * breath * burstScale;

    // 视角
    const drag = dragRef.current;
    const view = viewRef.current;
    if (drag.isDragging) {
      view.yaw += (view.targetYaw - view.yaw) * 0.35;
      view.pitch += (view.targetPitch - view.pitch) * 0.35;
    } else {
      if (Math.abs(drag.velX) > 0.0001 || Math.abs(drag.velY) > 0.0001) {
        view.targetYaw += drag.velX;
        view.targetPitch += drag.velY;
        view.targetPitch = clamp(view.targetPitch, -1.35, 1.35);
        drag.velX *= 0.92;
        drag.velY *= 0.92;
      }
      view.yaw += (view.targetYaw - view.yaw) * 0.08;
      view.pitch += (view.targetPitch - view.pitch) * 0.08;
    }
    const viewYaw = view.yaw;
    const viewPitch = view.pitch;
    const autoRot = reducedMotion ? 0 : (frame * 0.02 + burstSpin);
    const rotYaw = viewYaw + autoRot * 0.3;

    // 预计算所有分支点的屏幕坐标（用于后续渲染复用）
    const branchScreenCache: Array<Array<{ sx: number; sy: number; persp: number; z: number }>> = [];
    for (const branch of branches) {
      const pts: Array<{ sx: number; sy: number; persp: number; z: number }> = [];
      for (const pt of branch.points) {
        const [x1, y1, z1] = rotY(pt.x, pt.y, pt.z, rotYaw);
        const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
        const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
        pts.push({
          sx: cx + x2 * scale * persp,
          sy: cy + y2 * scale * persp,
          persp,
          z: z2,
        });
      }
      branchScreenCache.push(pts);
    }

    // ═══ 1. 背景星场 ═══
    ctx.globalCompositeOperation = 'lighter';
    for (const star of bgStars) {
      const [x1, y1, z1] = rotY(star.x, star.y, star.z, viewYaw * 0.3);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch * 0.3);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;
      if (sx < -5 || sx > width + 5 || sy < -5 || sy > height + 5) continue;
      const twinkle = reducedMotion ? 0.7 : (0.5 + 0.5 * Math.sin(frame * star.twinkleSpeed + star.twinklePhase));
      const alpha = star.brightness * twinkle * persp;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255, 220, 180, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, star.size * persp), 0, Math.PI * 2);
      ctx.fill();
    }

    // ═══ 2. 背景光晕 ═══
    ctx.globalAlpha = 0.5 * burstAlpha;
    const gw = scale * 2.2, gh = scale * 1.9;
    ctx.drawImage(glowSprite, cx - gw / 2, cy - gh / 2, gw, gh);

    // ═══ 3. 更新粒子位置 ═══
    if (!reducedMotion) {
      const dtScaled = dt * 60;
      for (const p of particles) {
        p.progress += p.speed * dtScaled;
        p.life += dtScaled;

        const branch = branches[p.branchId];
        if (branch) {
          const noise = curlNoise2D(p.progress * 5 + p.branchId, p.branchId * 0.7, frame);
          p.offset = noise * branch.thickness * 0.012;
        }

        if (p.progress >= 1 || p.life > p.maxLife) {
          p.progress = 0;
          p.life = 0;
          p.trail = [];
          p.maxLife = 150 + Math.random() * 200;
        }

        if (branch) {
          const pos = getBranchPosition(branch, p.progress, p.offset);
          p.trail.push({ x: pos.x, y: pos.y, z: pos.z });
          if (p.trail.length > p.trailMax) p.trail.shift();
        }
      }

      // 更新信号脉冲
      for (const sig of signals) {
        sig.progress += sig.speed * dtScaled;
        sig.life += dtScaled;
        if (sig.progress >= 1 || sig.life > 400) {
          sig.progress = 0;
          sig.life = 0;
          sig.intensity = 0.6 + Math.random() * 0.4;
          sig.speed = 0.008 + Math.random() * 0.012;
        }
      }
    }

    // ═══ 4. 渲染分支骨架 — 多层辉光（核心改进：让神经元形态清晰可见） ═══
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi];
      const screenPts = branchScreenCache[bi];
      if (!screenPts || screenPts.length < 2) continue;

      const [r, g, b] = kindColor(branch.kind, 0.5); // 用中段色调

      // --- Pass 1: 外层宽辉光（大半径低透明度） ---
      const outerAlpha = branch.thickness * 0.08 * burstAlpha;
      if (outerAlpha > 0.003) {
        ctx.globalAlpha = outerAlpha;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.lineWidth = branch.thickness * 8 * burstScale;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        }
        ctx.stroke();
      }

      // --- Pass 2: 中层辉光 ---
      const midAlpha = branch.thickness * 0.15 * burstAlpha;
      if (midAlpha > 0.005) {
        ctx.globalAlpha = midAlpha;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.lineWidth = branch.thickness * 3.5 * burstScale;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        }
        ctx.stroke();
      }

      // --- Pass 3: 亮芯线（细而亮） ---
      const coreAlpha = branch.thickness * 0.3 * burstAlpha;
      if (coreAlpha > 0.008) {
        ctx.globalAlpha = coreAlpha;
        ctx.strokeStyle = `rgba(255,230,180,0.9)`;
        ctx.lineWidth = branch.thickness * 1.2 * burstScale;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        }
        ctx.stroke();
      }

      // --- Pass 4: 初级树突根部增亮（连接胞体处更亮） ---
      if (branch.level === 0 && screenPts.length >= 3) {
        const rootAlpha = 0.25 * burstAlpha;
        ctx.globalAlpha = rootAlpha;
        ctx.strokeStyle = `rgba(255,250,220,0.9)`;
        ctx.lineWidth = branch.thickness * 2.0 * burstScale;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        ctx.lineTo(screenPts[2].sx, screenPts[2].sy);
        ctx.stroke();
      }
    }

    // ═══ 5. 渲染信号脉冲 — 沿分支传播的明亮光点 ═══
    ctx.globalCompositeOperation = 'lighter';

    for (const sig of signals) {
      const branch = branches[sig.branchId];
      if (!branch) continue;
      const screenPts = branchScreenCache[sig.branchId];
      if (!screenPts) continue;

      const pos = getBranchPosition(branch, sig.progress, 0);
      const [x1, y1, z1] = rotY(pos.x, pos.y, pos.z, rotYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;

      const [r, g, b] = kindColor(branch.kind, sig.progress);
      const lifeFade = Math.min(1, sig.life / 20) * Math.min(1, (400 - sig.life) / 50);
      const alpha = sig.intensity * persp * lifeFade * burstAlpha;

      // 信号脉冲光晕
      const pulseSize = 15 * sig.intensity * persp * burstScale;
      ctx.globalAlpha = Math.min(0.8, alpha * 0.5);
      ctx.drawImage(particleSprite, sx - pulseSize / 2, sy - pulseSize / 2, pulseSize, pulseSize);

      // 信号脉冲核心
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = `rgba(255,250,220,0.95)`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.5, 2.5 * sig.intensity * persp * burstScale), 0, Math.PI * 2);
      ctx.fill();

      // 信号脉冲拖尾（沿分支反方向几段）
      const trailSegs = 5;
      for (let t = 1; t <= trailSegs; t++) {
        const trailProgress = Math.max(0, sig.progress - t * 0.015);
        const tPos = getBranchPosition(branch, trailProgress, 0);
        const [tx1, ty1, tz1] = rotY(tPos.x, tPos.y, tPos.z, rotYaw);
        const [tx2, ty2, tz2] = rotX(tx1, ty1, tz1, viewPitch);
        const tp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + tz2));
        const tsx = cx + tx2 * scale * tp;
        const tsy = cy + ty2 * scale * tp;
        const tAlpha = alpha * (1 - t / trailSegs) * 0.5;
        if (tAlpha < 0.01) continue;
        ctx.globalAlpha = tAlpha;
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.beginPath();
        ctx.arc(tsx, tsy, Math.max(0.8, 1.5 * (1 - t / trailSegs) * persp * burstScale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ═══ 6. 渲染粒子拖尾（强化分支形态） ═══
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (const p of particles) {
      const branch = branches[p.branchId];
      if (!branch || p.trail.length < 2) continue;

      const distFromCenter = p.progress;
      const [r, g, b] = kindColor(p.kind, distFromCenter);

      for (let i = 1; i < p.trail.length; i++) {
        const t0 = p.trail[i - 1];
        const t1 = p.trail[i];
        const [tx1, ty1, tz1] = rotY(t0.x, t0.y, t0.z, rotYaw);
        const [tx2, ty2, tz2] = rotX(tx1, ty1, tz1, viewPitch);
        const tp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + tz2));
        const [ux1, uy1, uz1] = rotY(t1.x, t1.y, t1.z, rotYaw);
        const [ux2, uy2, uz2] = rotX(ux1, uy1, uz1, viewPitch);
        const up = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + uz2));

        const x0 = cx + tx2 * scale * tp;
        const y0 = cy + ty2 * scale * tp;
        const x1s = cx + ux2 * scale * up;
        const y1s = cy + uy2 * scale * up;

        const trailT = i / p.trail.length;
        const lifeFade = Math.min(1, p.life / 15) * Math.min(1, (p.maxLife - p.life) / 25);
        const trailAlpha = trailT * 0.4 * branch.thickness * tp * lifeFade * burstAlpha;
        if (trailAlpha < 0.01) continue;

        ctx.globalAlpha = trailAlpha;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.lineWidth = trailT * p.size * branch.thickness * tp * 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1s, y1s);
        ctx.stroke();
      }
    }

    // ═══ 7. 粒子点渲染 ═══
    const screenPositions: Array<{ kind: NodeKind; sx: number; sy: number }> = [];

    for (const p of particles) {
      const branch = branches[p.branchId];
      if (!branch) continue;

      const pos = getBranchPosition(branch, p.progress, p.offset);
      const [x1, y1, z1] = rotY(pos.x, pos.y, pos.z, rotYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;

      screenPositions.push({ kind: p.kind, sx, sy });

      const [r, g, b] = kindColor(p.kind, p.progress);
      const twinkle = reducedMotion ? 1.0 : (0.75 + 0.25 * Math.sin(frame * 3 + p.branchId * 0.5));
      const pulse = 0.65 + Math.sin(frame * p.speed * 100 + p.branchId) * 0.35;
      const lifeFade = Math.min(1, p.life / 15) * Math.min(1, (p.maxLife - p.life) / 25);
      const alpha = (0.5 + 0.3 * pulse) * persp * twinkle * lifeFade * burstAlpha;

      const spriteSize = p.size * 10 * pulse * persp * branch.thickness;
      ctx.globalAlpha = Math.min(0.85, alpha);
      ctx.drawImage(particleSprite, sx - spriteSize / 2, sy - spriteSize / 2, spriteSize, spriteSize);

      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.6, p.size * 0.6 * persp * branch.thickness), 0, Math.PI * 2);
      ctx.fill();
    }

    screenPositionsRef.current = screenPositions;

    // ═══ 8. 胞体核心 — 更突出的白热球体 ═══
    const [ccx1, ccy1, ccz1] = rotY(0, 0, 0, viewYaw);
    const [ccx2, ccy2, ccz2] = rotX(ccx1, ccy1, ccz1, viewPitch);
    const corePersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + ccz2));
    const coreX = cx + ccx2 * scale * corePersp;
    const coreY = cy + ccy2 * scale * corePersp;

    ctx.globalCompositeOperation = 'lighter';
    const coreBurst = burstProgress < 0.3 ? (1 + (0.3 - burstProgress) * 3) : 1;
    const corePulse = (0.3 + Math.sin(frame * 0.8) * 0.12) * coreBurst;
    const coreR = scale * 0.16 * corePersp;

    // 外层弥散光晕
    ctx.globalAlpha = Math.min(0.7, corePulse * 0.8 * corePersp * burstAlpha);
    const og = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreR * 2.5);
    og.addColorStop(0, 'rgba(255,160,60,0.15)');
    og.addColorStop(0.3, 'rgba(255,120,40,0.08)');
    og.addColorStop(0.7, 'rgba(200,80,30,0.03)');
    og.addColorStop(1, 'rgba(120,40,15,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 中层光晕
    ctx.globalAlpha = Math.min(0.8, corePulse * 1.1 * corePersp * burstAlpha);
    const mg = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreR * 1.2);
    mg.addColorStop(0, 'rgba(255,255,240,0.25)');
    mg.addColorStop(0.15, 'rgba(255,220,150,0.18)');
    mg.addColorStop(0.4, 'rgba(255,160,60,0.12)');
    mg.addColorStop(0.75, 'rgba(200,100,40,0.04)');
    mg.addColorStop(1, 'rgba(150,60,20,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // 核心 sprite
    ctx.globalAlpha = Math.min(0.95, corePulse * 1.3 * burstAlpha);
    const csSize = coreR * 1.8;
    ctx.drawImage(coreSprite, coreX - csSize / 2, coreY - csSize / 2, csSize, csSize);

    // 白热点
    ctx.globalAlpha = Math.min(1, corePulse * 2.0 * burstAlpha);
    const ig = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreR * 0.35);
    ig.addColorStop(0, 'rgba(255,255,255,0.5)');
    ig.addColorStop(0.5, 'rgba(255,240,200,0.2)');
    ig.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 脉冲光射线
    if (!reducedMotion && burstProgress > 0.3) {
      const rayCount = 8;
      const rayRot = frame * 0.12;
      const rayLen = coreR * 3.5;
      const rayPulse = 0.5 + 0.5 * Math.sin(frame * 0.8);
      ctx.globalAlpha = 0.06 * rayPulse * burstAlpha;
      ctx.lineWidth = 1.5;
      for (let r = 0; r < rayCount; r++) {
        const angle = rayRot + (r / rayCount) * Math.PI * 2;
        const ex = coreX + Math.cos(angle) * rayLen;
        const ey = coreY + Math.sin(angle) * rayLen;
        const rg = ctx.createLinearGradient(coreX, coreY, ex, ey);
        rg.addColorStop(0, 'rgba(255,220,150,0.3)');
        rg.addColorStop(0.5, 'rgba(255,140,50,0.1)');
        rg.addColorStop(1, 'rgba(200,80,30,0)');
        ctx.strokeStyle = rg;
        ctx.beginPath();
        ctx.moveTo(coreX, coreY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, [state, particleSprite, coreSprite, glowSprite, reducedMotion]);

  // 动画循环 30fps
  useEffect(() => {
    let running = true;
    let lastFrame = 0;
    const frameInterval = 1000 / 30;
    const loop = (now: number) => {
      if (!running) return;
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // 自动隐藏提示
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  // === 交互 ===
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    try { container.setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current.isDragging = true;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.velX = 0;
    dragRef.current.velY = 0;
    dragRef.current.pointerId = e.pointerId;
    setIsDragging(true);
    setShowHint(false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.isDragging) {
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      const sens = 0.006;
      viewRef.current.targetYaw += dx * sens;
      viewRef.current.targetPitch += dy * sens;
      viewRef.current.targetPitch = clamp(viewRef.current.targetPitch, -1.35, 1.35);
      drag.velX = dx * sens * 0.5;
      drag.velY = dy * sens * 0.5;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    } else {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const positions = screenPositionsRef.current;
      let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;
      for (const pos of positions) {
        const d = Math.hypot(x - pos.sx, y - pos.sy);
        if (d < 20 && (!best || d < best.d)) {
          best = { kind: pos.kind, x: pos.sx, y: pos.sy, d };
        }
      }
      if (best) setHoverInfo({ kind: best.kind, x: best.x, y: best.y });
      else setHoverInfo(null);
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId === e.pointerId || drag.isDragging) {
      const container = containerRef.current;
      if (container) try { container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      drag.isDragging = false;
      drag.pointerId = -1;
      setIsDragging(false);
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    viewRef.current.targetYaw = 0;
    viewRef.current.targetPitch = DEFAULT_PITCH;
    dragRef.current.velX = 0;
    dragRef.current.velY = 0;
  }, []);

  const kindLabels: Record<NodeKind, string> = {
    agent: '时墨',
    memory: '记忆',
    event: '事件',
    knowledge: '知识',
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHoverInfo(null)}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hoverInfo && !isDragging && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-glass)] px-2 py-1 text-xs text-[var(--color-text-secondary)] backdrop-blur-glass"
          style={{ left: hoverInfo.x + 12, top: hoverInfo.y - 24, transform: 'translateX(-50%)' }}
        >
          {kindLabels[hoverInfo.kind]}
        </div>
      )}
      {showHint && (
        <div className="life-core__drag-hint pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-glass)] px-3 py-1 text-xs text-[var(--color-text-tertiary)] backdrop-blur-glass">
          拖拽旋转神经元 · 双击重置 ✦
        </div>
      )}
    </div>
  );
}

export default LifeCoreCanvas;
