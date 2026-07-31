'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 粒子云树 V12 (3D Particle Cloud · Emerald Pulse)
 * ─────────────────────────────────────────────────────────────
 * 复刻 Bilibili BV1ow4m1Y7qu 粒子神经元效果
 *
 * V12 核心变化：3D 深度 + 脉冲运动 + 翡翠绿配色
 * - 增强Z轴深度变化，分支在三维空间中弯曲，非平面
 * - 粒子云脉冲运动：沿径向呼吸式扩张/收缩
 * - 配色统一为项目翡翠绿：白绿胞体 → 翠绿中段 → 深绿终端
 * - 零线条渲染，纯粒子云勾勒树状形态
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

/** 粒子云粒子 — 沿分支流动分布，通过密度和亮度勾勒出树状形态 */
interface CloudParticle {
  branchId: number;
  progress: number;       // 沿分支的位置 0~1
  flowSpeed: number;      // 沿分支流动速度
  offsetX: number;        // 垂直于分支的横向偏移（云团散射）
  offsetY: number;        // 纵向微小偏移
  offsetZ: number;        // 深度偏移
  baseSize: number;       // 基础粒子大小
  phase: number;          // 闪烁相位
  twinkleSpeed: number;   // 闪烁速度
  brightness: number;     // 基础亮度倍率
  pulsePhase: number;     // 脉冲运动相位
  pulseSpeed: number;     // 脉冲运动速度
  pulseAmp: number;       // 脉冲运动振幅（沿径向偏移）
  kind: NodeKind;
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
// 翡翠绿温度梯度 — 白绿→翠绿→深绿
// 项目主色 #00D26A
// ═══════════════════════════════════════════

function tempColor(r: number): [number, number, number] {
  // r=0 胞体端：白绿 #E0FFE8
  // r=0.25 近端：亮翠绿 #00D26A
  // r=0.5 中段：翠绿 #00B85A
  // r=0.75 远端：深翠绿 #006B3C
  // r=1 终端：暗绿 #003D22
  if (r < 0.08) {
    const t = r / 0.08;
    return [Math.round(lerp(224, 180, t)), Math.round(lerp(255, 250, t)), Math.round(lerp(232, 210, t))];
  }
  if (r < 0.25) {
    const t = (r - 0.08) / 0.17;
    return [Math.round(lerp(180, 0, t)), Math.round(lerp(250, 210, t)), Math.round(lerp(210, 106, t))];
  }
  if (r < 0.5) {
    const t = (r - 0.25) / 0.25;
    return [Math.round(lerp(0, 0, t)), Math.round(lerp(210, 184, t)), Math.round(lerp(106, 90, t))];
  }
  if (r < 0.75) {
    const t = (r - 0.5) / 0.25;
    return [Math.round(lerp(0, 0, t)), Math.round(lerp(184, 107, t)), Math.round(lerp(90, 60, t))];
  }
  const t = clamp((r - 0.75) / 0.25, 0, 1);
  return [Math.round(lerp(0, 0, t)), Math.round(lerp(107, 61, t)), Math.round(lerp(60, 34, t))];
}

function kindColor(kind: NodeKind, r: number): [number, number, number] {
  const [cr, cg, cb] = tempColor(r);
  switch (kind) {
    case 'memory':
      // 偏青绿
      return [clamp(cr, 0, 255), clamp(cg + 15, 0, 255), clamp(cb + 20, 0, 255)];
    case 'event':
      // 偏蓝绿
      return [clamp(cr - 5, 0, 255), clamp(cg, 0, 255), clamp(cb + 30, 0, 255)];
    case 'knowledge':
      // 偏黄绿
      return [clamp(cr + 30, 0, 255), clamp(cg + 10, 0, 255), clamp(cb - 10, 0, 255)];
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
  cloudParticles: CloudParticle[];
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
  // 3D 分支创建 — 使用球面坐标（方位角 + 仰角）实现真正的三维伸展
  function createBranch(
    parentId: number | null,
    startX: number, startY: number, startZ: number,
    azimuth: number,   // 水平方位角
    elevation: number, // 垂直仰角 (-π/2 ~ π/2)
    length: number,
    kind: NodeKind,
    depth: number,
  ): number {
    const id = branchIdCounter++;
    const thickness = depth === 0 ? 1.0 : depth === 1 ? 0.55 : depth === 2 ? 0.3 : 0.15;

    const segments = 12 + Math.floor(rand() * 6);
    const points: { x: number; y: number; z: number }[] = [];
    let cx = startX, cy = startY, cz = startZ;
    let curAz = azimuth;
    let curEl = elevation;

    points.push({ x: cx, y: cy, z: cz });

    for (let i = 1; i <= segments; i++) {
      // 3D 有机弯曲：方位角和仰角同时逐步偏转
      const bendAz = depth === 0 ? 0.12 : depth === 1 ? 0.20 : 0.28;
      const bendEl = depth === 0 ? 0.10 : depth === 1 ? 0.16 : 0.22;
      curAz += (rand() - 0.5) * bendAz;
      curEl += (rand() - 0.5) * bendEl;
      // 仰角钳制，避免分支折回
      curEl = clamp(curEl, -1.2, 1.2);

      const segLen = length / segments;
      // 球面坐标 → 笛卡尔坐标
      const cosEl = Math.cos(curEl);
      cx += Math.cos(curAz) * cosEl * segLen;
      cy += Math.sin(curAz) * cosEl * segLen;
      cz += Math.sin(curEl) * segLen;
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
      angle: azimuth,
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
        ? 3 + Math.floor(rand() * 2)
        : depth === 1
        ? 2 + Math.floor(rand() * 2)
        : 1 + Math.floor(rand() * 2);

      const endPoint = points[points.length - 1];
      for (let c = 0; c < childCount; c++) {
        // 3D 子分支偏转：方位角和仰角同时偏移
        const azOffset = (c - (childCount - 1) / 2) * (0.40 + rand() * 0.30);
        const elOffset = (rand() - 0.5) * 0.50;
        const childAz = curAz + azOffset;
        const childEl = clamp(curEl + elOffset, -1.2, 1.2);
        const childLength = length * (0.5 + rand() * 0.25);
        const childKind = kinds[(id + c) % kinds.length] || 'agent';
        const childId = createBranch(
          id, endPoint.x, endPoint.y, endPoint.z,
          childAz, childEl, childLength, childKind, depth + 1,
        );
        branch.children.push(childId);
      }
    }

    return id;
  }

  // 创建初级树突 — 10-14 条主分支从胞体向三维空间辐射
  const primaryCount = 10 + Math.floor(rand() * 4);
  for (let i = 0; i < primaryCount; i++) {
    const azimuth = (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    // 随机仰角 — 让分支在Z轴方向充分展开，形成3D球状分布
    const elevation = (rand() - 0.5) * 1.0; // -0.5 ~ 0.5 弧度
    const length = 0.38 + rand() * 0.22;
    const kind = kinds[i % kinds.length] || 'agent';
    createBranch(null, 0, 0, 0, azimuth, elevation, length, kind, 0);
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

  // ═══ 生成粒子云 — 密集分布在分支路径上，通过密度勾勒出树状形态 ═══
  const cloudParticles: CloudParticle[] = [];
  for (const branch of branches) {
    // 粒子密度：初级分支最多，深层递减 — 高密度确保树状形态清晰可见
    const cloudCount = branch.level === 0 ? 75 + Math.floor(rand() * 30)
      : branch.level === 1 ? 48 + Math.floor(rand() * 20)
      : branch.level === 2 ? 28 + Math.floor(rand() * 14)
      : 14 + Math.floor(rand() * 8);

    for (let i = 0; i < cloudCount; i++) {
      // 沿分支进度分布，根部更密集（偏置分布）
      const rawT = rand();
      const progress = Math.pow(rawT, 0.7); // 偏向根部

      // 散射宽度：根部宽、终端窄，模拟云团形态
      const scatterWidth = branch.thickness * 0.020 * (1.0 - progress * 0.6);
      // 高斯散射（Box-Muller 近似）
      const gauss = (rand() + rand() + rand() - 1.5) * 0.67;
      const offsetX = gauss * scatterWidth;
      const offsetY = (rand() - 0.5) * scatterWidth * 0.5;
      const offsetZ = (rand() - 0.5) * scatterWidth * 0.4;

      // 亮度：根部更亮，终端更暗
      const distRatio = progress;
      const brightness = (1.0 - distRatio * 0.55) * (0.6 + rand() * 0.4);

      cloudParticles.push({
        branchId: branch.id,
        progress,
        // 流动速度 — 让粒子云沿分支缓慢流动
        flowSpeed: 0.0008 + rand() * 0.002,
        offsetX,
        offsetY,
        offsetZ,
        baseSize: branch.level === 0 ? 1.0 + rand() * 0.8
          : branch.level === 1 ? 0.7 + rand() * 0.6
          : 0.5 + rand() * 0.5,
        phase: rand() * Math.PI * 2,
        twinkleSpeed: 0.4 + rand() * 1.2,
        brightness,
        // 脉冲运动参数 — 沿径向呼吸式扩张/收缩
        pulsePhase: rand() * Math.PI * 2,
        pulseSpeed: 0.3 + rand() * 0.8,
        pulseAmp: 0.008 + rand() * 0.015,
        kind: branch.kind,
      });
    }
  }

  // 限制总粒子云数量 — 提高上限以支持更高密度的树状形态
  const maxCloud = 5200;
  if (cloudParticles.length > maxCloud) {
    for (let i = cloudParticles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cloudParticles[i], cloudParticles[j]] = [cloudParticles[j], cloudParticles[i]];
    }
    cloudParticles.length = maxCloud;
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

  return { branches, particles, cloudParticles, signals, bgStars };
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
    // 粒子光晕 — 翡翠绿
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(200,255,220,0.7)');
    grad.addColorStop(0.4, 'rgba(0,210,106,0.2)');
    grad.addColorStop(1, 'rgba(0,120,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    setParticleSprite(canvas);

    // 核心 sprite — 白绿
    const coreSize = 128;
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = coreSize; coreCanvas.height = coreSize;
    const cctx = coreCanvas.getContext('2d')!;
    const coreGrad = cctx.createRadialGradient(coreSize/2, coreSize/2, 0, coreSize/2, coreSize/2, coreSize/2);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.1, 'rgba(224,255,232,0.85)');
    coreGrad.addColorStop(0.25, 'rgba(0,210,106,0.4)');
    coreGrad.addColorStop(0.5, 'rgba(0,160,80,0.15)');
    coreGrad.addColorStop(1, 'rgba(0,100,50,0)');
    cctx.fillStyle = coreGrad;
    cctx.fillRect(0, 0, coreSize, coreSize);
    setCoreSprite(coreCanvas);

    // 背景光晕 — 翡翠绿
    const glowSize = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize; glowCanvas.height = glowSize;
    const gctx = glowCanvas.getContext('2d')!;
    const glowGrad = gctx.createRadialGradient(glowSize/2, glowSize/2, 0, glowSize/2, glowSize/2, glowSize/2);
    glowGrad.addColorStop(0, 'rgba(0,210,106,0.15)');
    glowGrad.addColorStop(0.15, 'rgba(0,180,90,0.1)');
    glowGrad.addColorStop(0.35, 'rgba(0,130,65,0.05)');
    glowGrad.addColorStop(0.65, 'rgba(0,90,45,0.02)');
    glowGrad.addColorStop(1, 'rgba(0,60,30,0)');
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

    const { branches, particles, cloudParticles, signals, bgStars } = neuronRef.current;
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
      ctx.fillStyle = 'rgba(180, 255, 200, 0.8)';
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

      // 更新粒子云流动 — 所有粒子沿分支缓慢流动，到终端后回到根部
      for (const cp of cloudParticles) {
        cp.progress += cp.flowSpeed * dtScaled;
        if (cp.progress >= 1) cp.progress -= 1; // 循环
      }
    }

    // ═══ 4. 渲染粒子云树状结构 — 流动 + 脉冲运动，纯粒子零线条 ═══
    ctx.globalCompositeOperation = 'lighter';

    for (const cp of cloudParticles) {
      const branch = branches[cp.branchId];
      if (!branch) continue;

      // 脉冲运动：沿径向（从胞体向外）呼吸式扩张/收缩
      const pulseWave = Math.sin(frame * cp.pulseSpeed + cp.pulsePhase);
      const pulseOffset = pulseWave * cp.pulseAmp;
      const dynamicProgress = clamp(cp.progress + pulseOffset, 0, 1);

      // 沿分支获取基础位置，叠加云团散射偏移
      const pos = getBranchPosition(branch, dynamicProgress, cp.offsetX);
      const px = pos.x + cp.offsetY;
      const py = pos.y;
      const pz = pos.z + cp.offsetZ;

      const [x1, y1, z1] = rotY(px, py, pz, rotYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;

      if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;

      const [r, g, b] = kindColor(cp.kind, dynamicProgress);

      // 闪烁 + 脉冲亮度
      const twinkle = reducedMotion ? 1.0 : (0.6 + 0.4 * Math.sin(frame * cp.twinkleSpeed + cp.phase));
      const pulseBrightness = reducedMotion ? 1.0 : (0.7 + 0.3 * pulseWave);
      const breathFade = reducedMotion ? 1.0 : (0.85 + 0.15 * Math.sin(frame * 0.5 + cp.phase * 0.3));

      const alpha = cp.brightness * twinkle * pulseBrightness * breathFade * persp * burstAlpha;
      if (alpha < 0.01) continue;

      // 外层光晕（sprite）
      const spriteSize = cp.baseSize * 8 * persp * burstScale;
      ctx.globalAlpha = Math.min(0.5, alpha * 0.4);
      ctx.drawImage(particleSprite, sx - spriteSize / 2, sy - spriteSize / 2, spriteSize, spriteSize);

      // 核心亮点
      ctx.globalAlpha = Math.min(0.9, alpha);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.4, cp.baseSize * 0.7 * persp * burstScale), 0, Math.PI * 2);
      ctx.fill();
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
      ctx.fillStyle = `rgba(220,255,235,0.95)`;
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

    // ═══ 6. 渲染粒子拖尾 — 以发光点形式渲染，绝不使用线条 ═══
    ctx.globalCompositeOperation = 'lighter';

    for (const p of particles) {
      const branch = branches[p.branchId];
      if (!branch || p.trail.length < 2) continue;

      const distFromCenter = p.progress;
      const [r, g, b] = kindColor(p.kind, distFromCenter);
      const lifeFade = Math.min(1, p.life / 15) * Math.min(1, (p.maxLife - p.life) / 25);

      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i];
        const [tx1, ty1, tz1] = rotY(t.x, t.y, t.z, rotYaw);
        const [tx2, ty2, tz2] = rotX(tx1, ty1, tz1, viewPitch);
        const tp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + tz2));

        const sx = cx + tx2 * scale * tp;
        const sy = cy + ty2 * scale * tp;

        const trailT = i / p.trail.length;
        const trailAlpha = trailT * 0.5 * branch.thickness * tp * lifeFade * burstAlpha;
        if (trailAlpha < 0.01) continue;

        // 发光点大小 — 沿拖尾递减
        const dotSize = Math.max(0.5, trailT * p.size * branch.thickness * tp * 1.0);

        // 外层光晕（sprite）
        const haloSize = dotSize * 6;
        ctx.globalAlpha = Math.min(0.35, trailAlpha * 0.5);
        ctx.drawImage(particleSprite, sx - haloSize / 2, sy - haloSize / 2, haloSize, haloSize);

        // 核心亮点
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fill();
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
    og.addColorStop(0, 'rgba(0,210,106,0.15)');
    og.addColorStop(0.3, 'rgba(0,180,90,0.08)');
    og.addColorStop(0.7, 'rgba(0,120,60,0.03)');
    og.addColorStop(1, 'rgba(0,60,30,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 中层光晕
    ctx.globalAlpha = Math.min(0.8, corePulse * 1.1 * corePersp * burstAlpha);
    const mg = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreR * 1.2);
    mg.addColorStop(0, 'rgba(240,255,245,0.25)');
    mg.addColorStop(0.15, 'rgba(150,255,200,0.18)');
    mg.addColorStop(0.4, 'rgba(0,210,106,0.12)');
    mg.addColorStop(0.75, 'rgba(0,150,75,0.04)');
    mg.addColorStop(1, 'rgba(0,80,40,0)');
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
    ig.addColorStop(0.5, 'rgba(200,255,220,0.2)');
    ig.addColorStop(1, 'rgba(0,210,106,0)');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 脉冲光射线 — 以粒子点形式渲染，不使用线条
    if (!reducedMotion && burstProgress > 0.3) {
      const rayCount = 8;
      const rayRot = frame * 0.12;
      const rayLen = coreR * 3.5;
      const rayPulse = 0.5 + 0.5 * Math.sin(frame * 0.8);
      const rayDots = 14;
      for (let r = 0; r < rayCount; r++) {
        const angle = rayRot + (r / rayCount) * Math.PI * 2;
        for (let d = 1; d <= rayDots; d++) {
          const distRatio = d / rayDots;
          const dist = distRatio * rayLen;
          const dx = coreX + Math.cos(angle) * dist;
          const dy = coreY + Math.sin(angle) * dist;
          const dotAlpha = (1 - distRatio) * 0.12 * rayPulse * burstAlpha;
          if (dotAlpha < 0.008) continue;
          ctx.globalAlpha = dotAlpha;
          ctx.fillStyle = `rgba(120,255,180,0.8)`;
          ctx.beginPath();
          ctx.arc(dx, dy, Math.max(0.5, 2.0 * (1 - distRatio * 0.7)), 0, Math.PI * 2);
          ctx.fill();
        }
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
