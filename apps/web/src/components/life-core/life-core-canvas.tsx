'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 螺旋星系粒子云 V7 (3D Interactive · Nebula Edition)
 * ─────────────────────────────────────────────────────────────
 * 参考风格：BLUE YARD 粒子星系 + Hubble 星云摄影 + 神经网络突触
 *
 * V7 视觉升级：
 * - 星云尘埃云层：8~12 个大型彩色尘埃云，柔光混合，营造体积感
 * - 能量神经丝线：近邻亮粒子间的曲线连接 + 流动信号光点
 * - 色彩温度梯度：核心白热 → 中段翡翠 → 外缘琥珀/紫罗兰
 * - 核心光晕重构：多层径向渐变 + 脉冲光射线
 * - 环境尘埃粒子：100 个微弱填充粒子，增加空间纵深
 * - 螺旋臂粒子流：臂上粒子沿轨道留有微弱拖尾
 * - 真 3D 坐标空间 + 透视投影 + 拖拽旋转 + 惯性 + 双击重置
 * - 闪烁 / 能量脉冲波 / 核心脉动 / 背景星场视差
 *
 * 节点绑定四类数据（用颜色区分）：
 * - memory    长期记忆   记忆金
 * - event     家庭事件   生命紫
 * - knowledge 知识文档   天空蓝
 * - agent     Agent 活动 时墨绿
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

// 粒子颜色 — 翡翠绿主色
const NODE_COLOR: Record<NodeKind, [number, number, number]> = {
  agent: [0, 210, 106],      // 时墨翡翠绿（主色，最多）
  memory: [245, 200, 91],    // 记忆金
  event: [167, 139, 250],    // 生命紫
  knowledge: [122, 184, 240], // 天空蓝
};

interface Particle {
  kind: NodeKind;
  // 归一化极坐标（相对于星系中心）
  r: number;        // 距离 0~1
  theta: number;    // 初始角度 0~2π
  // Z 轴高度（星系盘厚度，核心区厚外围薄）
  z: number;
  // 基础大小系数
  size: number;
  // 脉冲相位和速度
  phase: number;
  pulseSpeed: number;
  // 闪烁（独立于脉冲的快速亮度变化）
  twinkleSpeed: number;
  twinklePhase: number;
  // 径向漂移
  driftAmp: number;
  driftPhase: number;
  // 激活度 0~1
  activation: number;
  // 是否为核心粒子（白热）
  isCore: boolean;
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

/** 星云尘埃云 — 大型半透明彩色云团，营造体积感和氛围 */
interface DustCloud {
  x: number;
  y: number;
  z: number;
  rx: number;       // 云团半径（X 方向）
  ry: number;       // 云团半径（Y 方向）
  rotation: number;  // 云团旋转角
  color: [number, number, number];
  opacity: number;
  driftPhase: number;
  driftSpeed: number;
}

/** 能量丝线节点 — 用于构建近邻亮粒子间的曲线连接 */
interface Filament {
  startIdx: number;
  endIdx: number;
  ctrlOffset: number; // 贝塞尔控制点偏移
  phase: number;
  signalSpeed: number;
}

// 伪随机数生成器（seeded）
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

// 3D 旋转：绕 Y 轴（yaw / 偏航）
function rotY(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

// 3D 旋转：绕 X 轴（pitch / 俯仰）
function rotX(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

/**
 * 色彩温度梯度：根据粒子距核心的归一化距离调整颜色。
 * - r < 0.15：核心区白热化（向白色混合）
 * - 0.15 ~ 0.55：保持种类基色（翡翠/金/紫/蓝）
 * - r > 0.55：外缘冷却（向琥珀/紫罗兰偏移）
 */
function tempColor(base: [number, number, number], r: number): [number, number, number] {
  if (r < 0.15) {
    const t = 1 - r / 0.15;
    const w = t * 0.65;
    return [
      Math.round(base[0] + (255 - base[0]) * w),
      Math.round(base[1] + (255 - base[1]) * w),
      Math.round(base[2] + (255 - base[2]) * w),
    ];
  }
  if (r > 0.55) {
    const t = Math.min(1, (r - 0.55) / 0.45);
    const target: [number, number, number] = base[2] > base[1] ? [130, 100, 210] : [255, 170, 80];
    const w = t * 0.35;
    return [
      Math.round(base[0] + (target[0] - base[0]) * w),
      Math.round(base[1] + (target[1] - base[1]) * w),
      Math.round(base[2] + (target[2] - base[2]) * w),
    ];
  }
  return base;
}

/** 星云尘埃云配色方案 — 模拟 Hubble 星云摄影的彩色云团 */
const NEBULA_PALETTE: [number, number, number][] = [
  [80, 40, 120],    // 深紫
  [20, 80, 100],    // 深青
  [120, 60, 40],    // 暗琥珀
  [60, 30, 90],     // 靛紫
  [30, 90, 70],     // 暗翡翠
  [100, 50, 80],    // 玫瑰
  [40, 60, 110],    // 深蓝
  [90, 70, 30],     // 暗金
];

/**
 * 构建螺旋星系粒子云（3D 版）
 * - 超密核心：极端集中的中心区域，Z 厚度稍大
 * - 密集内环：环形高密度区
 * - 螺旋臂：3 条不对称旋臂向外延伸
 * - 稀疏光晕：边缘逐渐稀疏的粒子
 * - 星云尘埃云：8~12 个大型彩色云团
 * - 能量丝线：近邻亮粒子间的曲线连接
 * - 环境尘埃：100 个微弱填充粒子
 */
function buildGalaxy(counts: LifeCoreCounts, level: number): {
  particles: Particle[];
  stemPoints: { x: number; y: number; z: number }[];
  bgStars: BgStar[];
  dustClouds: DustCloud[];
  filaments: Filament[];
  ambientDust: Particle[];
} {
  const rand = mulberry32(42 + level * 7);
  // 粒子数量：1200 个，全屏沉浸式星系
  const total = Math.min(1200, 700 + (counts.memory + counts.event + counts.knowledge + counts.agent) * 10 + level * 15);

  // 按比例分配粒子类型
  const kindPool: NodeKind[] = [];
  const totalCount = counts.memory + counts.event + counts.knowledge + counts.agent;
  if (totalCount === 0) {
    for (let i = 0; i < total; i++) kindPool.push('agent');
  } else {
    const ratios = {
      agent: Math.max(0.3, counts.agent / Math.max(1, totalCount)),
      memory: Math.max(0.1, counts.memory / Math.max(1, totalCount)),
      event: Math.max(0.1, counts.event / Math.max(1, totalCount)),
      knowledge: Math.max(0.1, counts.knowledge / Math.max(1, totalCount)),
    };
    const sum = ratios.agent + ratios.memory + ratios.event + ratios.knowledge;
    for (let i = 0; i < total; i++) {
      const r = rand() * sum;
      let acc = 0;
      for (const [k, v] of Object.entries(ratios) as [NodeKind, number][]) {
        acc += v;
        if (r < acc) { kindPool.push(k); break; }
      }
    }
  }

  const particles: Particle[] = [];

  // 螺旋臂数量和旋绕系数
  const armCount = 3;
  const winding = 2.8; // 旋绕程度：越大螺旋越紧

  for (let i = 0; i < total; i++) {
    const randVal = rand();

    let r: number;
    let theta: number;
    let isCore = false;

    if (randVal < 0.18) {
      // 18% 粒子在超密核心（r < 0.12）
      r = Math.pow(rand(), 2.0) * 0.12;
      theta = rand() * Math.PI * 2;
      isCore = true;
    } else if (randVal < 0.40) {
      // 22% 粒子在密集内环（r 0.12~0.30）
      r = 0.12 + Math.pow(rand(), 0.7) * 0.18;
      const arm = Math.floor(rand() * armCount);
      theta = (arm / armCount) * Math.PI * 2 + r * winding + (rand() - 0.5) * 0.6;
    } else if (randVal < 0.85) {
      // 45% 粒子在螺旋臂（r 0.30~0.75）
      r = 0.30 + Math.pow(rand(), 0.5) * 0.45;
      const arm = Math.floor(rand() * armCount);
      theta = (arm / armCount) * Math.PI * 2 + r * winding + (rand() - 0.5) * 0.5 * (1 - r * 0.5);
    } else {
      // 15% 粒子在稀疏光晕（r 0.75~1.0）
      r = 0.75 + rand() * 0.25;
      theta = rand() * Math.PI * 2;
    }

    // Z 轴厚度：核心区稍厚，外围极薄（真实星系盘形态）
    const thickness = isCore ? 0.05 : (0.08 * (1 - r * 0.7));
    const z = (rand() - 0.5) * thickness;

    // 粒子大小：核心区域更大更亮，外围更小
    const sizeBase = isCore ? 1.4 : (r < 0.3 ? 1.1 : (r < 0.6 ? 0.9 : 0.7));
    const size = sizeBase + rand() * 0.3;

    particles.push({
      kind: kindPool[i] || 'agent',
      r,
      theta,
      z,
      size,
      phase: rand() * Math.PI * 2,
      pulseSpeed: 0.2 + rand() * 0.4,
      twinkleSpeed: 0.8 + rand() * 2.0,
      twinklePhase: rand() * Math.PI * 2,
      driftAmp: 0.002 + rand() * 0.004,
      driftPhase: rand() * Math.PI * 2,
      activation: 0.3 + rand() * 0.3,
      isCore,
    });
  }

  // 轴突茎：从星系底部向下延伸（3D 坐标）
  const stemPoints: { x: number; y: number; z: number }[] = [];
  const stemSegments = 10;
  for (let i = 0; i <= stemSegments; i++) {
    const t = i / stemSegments;
    stemPoints.push({
      x: Math.sin(t * 1.5) * 0.015 * (1 - t * 0.5),
      y: 0.15 + t * 0.45,
      z: 0,
    });
  }

  // 背景星场：远景星星，视差旋转（更慢）
  const bgStars: BgStar[] = [];
  const starRand = mulberry32(99);
  for (let i = 0; i < 200; i++) {
    bgStars.push({
      x: (starRand() - 0.5) * 3.2,
      y: (starRand() - 0.5) * 3.2,
      z: (starRand() - 0.5) * 0.5,
      size: 0.3 + starRand() * 0.6,
      brightness: 0.06 + starRand() * 0.2,
      twinkleSpeed: 0.3 + starRand() * 0.9,
      twinklePhase: starRand() * Math.PI * 2,
    });
  }

  // === 星云尘埃云：8~12 个大型半透明彩色云团 ===
  const dustClouds: DustCloud[] = [];
  const cloudCount = 8 + Math.floor(rand() * 5); // 8~12
  for (let i = 0; i < cloudCount; i++) {
    // 云团分布在螺旋臂区域，距核心 0.2~0.8
    const cloudR = 0.2 + rand() * 0.6;
    const cloudTheta = rand() * Math.PI * 2;
    const cloudZ = (rand() - 0.5) * 0.06;
    dustClouds.push({
      x: Math.cos(cloudTheta) * cloudR,
      y: Math.sin(cloudTheta) * cloudR,
      z: cloudZ,
      rx: 0.08 + rand() * 0.12,   // 云团 X 半径
      ry: 0.06 + rand() * 0.10,   // 云团 Y 半径
      rotation: rand() * Math.PI,
      color: NEBULA_PALETTE[Math.floor(rand() * NEBULA_PALETTE.length)],
      opacity: 0.025 + rand() * 0.035,
      driftPhase: rand() * Math.PI * 2,
      driftSpeed: 0.05 + rand() * 0.08,
    });
  }

  // === 能量丝线：近邻亮粒子间的曲线连接 ===
  const filaments: Filament[] = [];
  // 收集亮粒子索引（核心粒子 + 内环高激活粒子）
  const brightIdx: number[] = [];
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].isCore || (particles[i].r < 0.5 && particles[i].activation > 0.4)) {
      brightIdx.push(i);
    }
  }
  // 为每个亮粒子找 1~2 个最近邻亮粒子建立连接
  const maxFilaments = 180;
  for (let i = 0; i < brightIdx.length && filaments.length < maxFilaments; i++) {
    const a = brightIdx[i];
    const pa = particles[a];
    // 局部搜索：只检查附近的亮粒子
    let neighbors: { idx: number; dist: number }[] = [];
    for (let j = 0; j < brightIdx.length; j++) {
      if (j === i) continue;
      const b = brightIdx[j];
      const pb = particles[b];
      const dr = pa.r - pb.r;
      const dtheta = Math.abs(((pa.theta - pb.theta + Math.PI) % (Math.PI * 2)) - Math.PI);
      const dist = Math.hypot(dr, dtheta * Math.max(pa.r, pb.r));
      if (dist < 0.25) {
        neighbors.push({ idx: b, dist });
      }
    }
    neighbors.sort((x, y) => x.dist - y.dist);
    // 取最近 1~2 个
    const connectCount = Math.min(2, neighbors.length);
    for (let k = 0; k < connectCount; k++) {
      filaments.push({
        startIdx: a,
        endIdx: neighbors[k].idx,
        ctrlOffset: (rand() - 0.5) * 0.08,
        phase: rand() * Math.PI * 2,
        signalSpeed: 0.3 + rand() * 0.5,
      });
    }
  }

  // === 环境尘埃：100 个微弱填充粒子，增加空间纵深 ===
  const ambientDust: Particle[] = [];
  for (let i = 0; i < 100; i++) {
    const ar = 0.3 + rand() * 0.9;
    const atheta = rand() * Math.PI * 2;
    ambientDust.push({
      kind: 'agent',
      r: ar,
      theta: atheta,
      z: (rand() - 0.5) * 0.15,
      size: 0.3 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
      pulseSpeed: 0.1 + rand() * 0.2,
      twinkleSpeed: 0.3 + rand() * 0.6,
      twinklePhase: rand() * Math.PI * 2,
      driftAmp: 0.001 + rand() * 0.002,
      driftPhase: rand() * Math.PI * 2,
      activation: 0.1 + rand() * 0.15,
      isCore: false,
    });
  }

  return { particles, stemPoints, bgStars, dustClouds, filaments, ambientDust };
}

// 默认视角俯仰角（产生椭圆星系外观）
const DEFAULT_PITCH = -0.5;
// 透视焦距（越大越接近平行投影，越小透视越强）
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

  const galaxy = useMemo(() => buildGalaxy(counts, level), [counts, level]);
  const galaxyRef = useRef(galaxy);
  galaxyRef.current = galaxy;

  // 拖拽状态（用 ref 避免重渲染）
  const dragRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    velX: 0,
    velY: 0,
    pointerId: -1,
  });

  // 视角旋转状态
  const viewRef = useRef({
    yaw: 0,
    pitch: DEFAULT_PITCH,
    targetYaw: 0,
    targetPitch: DEFAULT_PITCH,
  });

  // 是否已交互过（用于隐藏提示）
  const interactedRef = useRef(false);

  // 初始爆发动画起始时间戳
  const startTimeRef = useRef<number>(0);
  const BURST_DURATION = 2.5; // 爆发动画持续 2.5 秒

  // 预渲染粒子 sprite
  const [particleSprite, setParticleSprite] = useState<HTMLCanvasElement | null>(null);
  const [coreSprite, setCoreSprite] = useState<HTMLCanvasElement | null>(null);
  const [nebulaGlowSprite, setNebulaGlowSprite] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 标准粒子光晕 sprite — 柔和的径向渐变
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    setParticleSprite(canvas);

    // 核心粒子 sprite — 更大更亮，白热中心
    const coreSize = 128;
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = coreSize;
    coreCanvas.height = coreSize;
    const cctx = coreCanvas.getContext('2d')!;
    const coreGrad = cctx.createRadialGradient(coreSize / 2, coreSize / 2, 0, coreSize / 2, coreSize / 2, coreSize / 2);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.1, 'rgba(220,255,240,0.8)');
    coreGrad.addColorStop(0.25, 'rgba(150,255,200,0.4)');
    coreGrad.addColorStop(0.5, 'rgba(0,210,106,0.15)');
    coreGrad.addColorStop(1, 'rgba(0,210,106,0)');
    cctx.fillStyle = coreGrad;
    cctx.fillRect(0, 0, coreSize, coreSize);
    setCoreSprite(coreCanvas);

    // 星云背景光晕 — 大范围柔和翡翠绿辉光
    const glowSize = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize;
    glowCanvas.height = glowSize;
    const gctx = glowCanvas.getContext('2d')!;
    const glowGrad = gctx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
    glowGrad.addColorStop(0, 'rgba(0,210,106,0.18)');
    glowGrad.addColorStop(0.15, 'rgba(0,210,106,0.12)');
    glowGrad.addColorStop(0.35, 'rgba(0,180,90,0.06)');
    glowGrad.addColorStop(0.65, 'rgba(0,140,80,0.02)');
    glowGrad.addColorStop(1, 'rgba(0,100,60,0)');
    gctx.fillStyle = glowGrad;
    gctx.fillRect(0, 0, glowSize, glowSize);
    setNebulaGlowSprite(glowCanvas);
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

    const { particles, stemPoints, bgStars, dustClouds, filaments, ambientDust } = galaxyRef.current;
    if (!particles.length || !particleSprite || !coreSprite || !nebulaGlowSprite) return;

    // 初始化爆发动画起始时间
    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now() / 1000;
    }

    const frame = performance.now() / 1000;
    const cx = width / 2;
    const cy = height * 0.42;
    // 全屏模式：星系缩放占满较短边的 1.1 倍，让粒子铺满视口
    const galaxyScale = Math.min(width, height) * 1.1;

    // 初始爆发动画进度 (0 → 1)
    const elapsed = frame - startTimeRef.current;
    const burstProgress = reducedMotion ? 1 : Math.min(1, elapsed / BURST_DURATION);
    // easeOutExpo: 快速爆发后缓慢 settles
    const burstEase = burstProgress === 1 ? 1 : 1 - Math.pow(2, -10 * burstProgress);
    // 爆发缩放：从 0.05 (极小核心) → 1.0 (完整大小)
    const burstScale = 0.05 + burstEase * 0.95;
    // 爆发期间额外的旋转动量
    const burstSpin = reducedMotion ? 0 : (1 - burstEase) * 3.0;

    // 星系整体呼吸
    const breath = state === 'companion'
      ? 0.96 + Math.sin(frame * 0.6) * 0.04
      : state === 'learning'
      ? 1.0 + Math.sin(frame * 1.2) * 0.06
      : state === 'recalling'
      ? 0.93 + Math.sin(frame * 1.6) * 0.08
      : 1.04 + Math.sin(frame * 0.5) * 0.05;

    const scale = galaxyScale * breath * burstScale;

    // 更新视角旋转（惯性 + 插值）
    const drag = dragRef.current;
    const view = viewRef.current;

    if (drag.isDragging) {
      // 拖拽中：快速跟随目标
      view.yaw += (view.targetYaw - view.yaw) * 0.35;
      view.pitch += (view.targetPitch - view.pitch) * 0.35;
    } else {
      // 惯性衰减
      if (Math.abs(drag.velX) > 0.0001 || Math.abs(drag.velY) > 0.0001) {
        view.targetYaw += drag.velX;
        view.targetPitch += drag.velY;
        view.targetPitch = clamp(view.targetPitch, -1.35, 1.35);
        drag.velX *= 0.92;
        drag.velY *= 0.92;
      }
      // 平滑插值
      view.yaw += (view.targetYaw - view.yaw) * 0.08;
      view.pitch += (view.targetPitch - view.pitch) * 0.08;
    }

    const viewYaw = view.yaw;
    const viewPitch = view.pitch;

    // 自动自转（星系自身旋转）+ 爆发期间额外旋转
    const baseRotation = reducedMotion ? 0 : (frame * 0.04 + burstSpin);

    // 能量脉冲波相位（从中心向外传播的亮度波）
    const sparkPhase = reducedMotion ? 0 : frame * 0.5;

    // 爆发期间整体透明度渐入
    const burstAlpha = reducedMotion ? 1 : Math.min(1, burstProgress * 1.5);

    // === 1. 背景星场（视差旋转，更慢） ===
    ctx.globalCompositeOperation = 'lighter';
    for (const star of bgStars) {
      // 星星以 0.3 倍速率旋转，产生远景视差
      const [x1, y1, z1] = rotY(star.x, star.y, star.z, viewYaw * 0.3);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch * 0.3);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;

      // 跳过画面外的星星
      if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;

      const twinkle = reducedMotion ? 0.7 : (0.5 + 0.5 * Math.sin(frame * star.twinkleSpeed + star.twinklePhase));
      const alpha = star.brightness * twinkle * (0.4 + persp * 0.6);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, star.size * persp), 0, Math.PI * 2);
      ctx.fill();
    }

    // === 2. 星云背景光晕（大范围柔和辉光，爆发期间渐入） ===
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * burstAlpha;
    const glowW = scale * 2.2;
    const glowH = scale * 1.9;
    ctx.drawImage(nebulaGlowSprite, cx - glowW / 2, cy - glowH / 2, glowW, glowH);

    // === 2.5 星云尘埃云（大型彩色云团，柔光混合营造体积感） ===
    ctx.globalCompositeOperation = 'lighter';
    for (const cloud of dustClouds) {
      // 云团缓慢漂移
      const drift = Math.sin(frame * cloud.driftSpeed + cloud.driftPhase) * 0.015;
      const cx0 = cloud.x + drift * Math.cos(cloud.rotation);
      const cy0 = cloud.y + drift * Math.sin(cloud.rotation);
      // 3D 投影
      const [dx1, dy1, dz1] = rotY(cx0, cy0, cloud.z, viewYaw);
      const [dx2, dy2, dz2] = rotX(dx1, dy1, dz1, viewPitch);
      const cpersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + dz2));
      const sx = cx + dx2 * scale * cpersp;
      const sy = cy + dy2 * scale * cpersp;
      // 椭圆云团尺寸（随透视缩放）
      const wRadius = cloud.rx * scale * cpersp;
      const hRadius = cloud.ry * scale * cpersp;
      if (wRadius < 2 || hRadius < 2) continue;
      // 跳过画面外的云团
      if (sx + wRadius < 0 || sx - wRadius > width || sy + hRadius < 0 || sy - hRadius > height) continue;

      const [r, g, b] = cloud.color;
      const cloudAlpha = cloud.opacity * cpersp * burstAlpha;
      // 径向渐变椭圆 — 柔和的体积感
      const cloudGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(wRadius, hRadius));
      cloudGrad.addColorStop(0, `rgba(${r},${g},${b},${cloudAlpha * 1.8})`);
      cloudGrad.addColorStop(0.4, `rgba(${r},${g},${b},${cloudAlpha * 0.8})`);
      cloudGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cloudGrad;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(cloud.rotation + viewYaw * 0.3);
      ctx.scale(wRadius / Math.max(wRadius, hRadius), hRadius / Math.max(wRadius, hRadius));
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(wRadius, hRadius), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // === 3. 轴突茎（3D 投影） ===
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(0, 210, 106, 0.25)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let stemStarted = false;
    for (let i = 0; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const waveX = Math.sin(frame * 0.4 + i * 0.3) * 0.003;
      const [x1, y1, z1] = rotY(sp.x + waveX, sp.y, sp.z, viewYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;
      if (!stemStarted) { ctx.moveTo(sx, sy); stemStarted = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // 茎上微弱粒子点
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const waveX = Math.sin(frame * 0.4 + i * 0.3) * 0.003;
      const [x1, y1, z1] = rotY(sp.x + waveX, sp.y, sp.z, viewYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const sx = cx + x2 * scale * persp;
      const sy = cy + y2 * scale * persp;
      const alpha = (0.15 + Math.sin(frame * 1.5 + i * 0.5) * 0.08) * persp;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0, 210, 106, 0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, (1.2 - i * 0.06) * persp), 0, Math.PI * 2);
      ctx.fill();
    }

    // === 4. 粒子（3D 透视渲染） ===
    // 全部使用 lighter（加法混合），重叠区域产生连续光晕
    ctx.globalCompositeOperation = 'lighter';

    // === 4a. 环境尘埃（微弱填充粒子，先画增加纵深） ===
    for (const p of ambientDust) {
      const angularVel = baseRotation * (1.0 / (0.3 + p.r * 0.7));
      const currentTheta = p.theta + angularVel;
      const lx = Math.cos(currentTheta) * p.r;
      const ly = Math.sin(currentTheta) * p.r;
      const lz = p.z;
      const [x1, y1, z1] = rotY(lx, ly, lz, viewYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const finalX = cx + x2 * scale * persp;
      const finalY = cy + y2 * scale * persp;
      if (finalX < -5 || finalX > width + 5 || finalY < -5 || finalY > height + 5) continue;

      const depthFactor = clamp((z2 + 1.0) * 0.5, 0.15, 1.0);
      const twinkle = reducedMotion ? 0.5 : (0.3 + 0.4 * Math.sin(frame * p.twinkleSpeed + p.twinklePhase));
      const alpha = p.activation * twinkle * depthFactor * burstAlpha * 0.4;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(180, 210, 230, 0.6)';
      ctx.beginPath();
      ctx.arc(finalX, finalY, Math.max(0.3, p.size * persp * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 微分自转：内圈角速度更大
      const angularVel = baseRotation * (1.0 / (0.3 + p.r * 0.7));
      const currentTheta = p.theta + angularVel;

      // 3D 局部坐标（星系盘在 XY 平面，Z 为厚度）
      const organicR = p.r * (1 + Math.sin(currentTheta * 3 + p.phase) * 0.03);
      const lx = Math.cos(currentTheta) * organicR;
      const ly = Math.sin(currentTheta) * organicR;
      const lz = p.z;

      // 径向漂移
      const drift = Math.sin(frame * p.pulseSpeed + p.driftPhase) * p.driftAmp;
      const dx = Math.cos(currentTheta) * drift;
      const dy = Math.sin(currentTheta) * drift;

      // 视角旋转：先 yaw 再 pitch
      const [x1, y1, z1] = rotY(lx + dx, ly + dy, lz, viewYaw);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);

      // 透视投影
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const finalX = cx + x2 * scale * persp;
      const finalY = cy + y2 * scale * persp;

      // 深度雾化：远端粒子变暗
      const depthFactor = clamp((z2 + 1.0) * 0.5, 0.15, 1.0);

      // 脉冲（缓慢亮度变化）
      const pulse = 0.65 + Math.sin(frame * p.pulseSpeed + p.phase) * 0.35;

      // 闪烁（快速独立亮度变化）
      const twinkle = reducedMotion ? 1.0 : (0.75 + 0.25 * Math.sin(frame * p.twinkleSpeed + p.twinklePhase));

      // 能量脉冲波（从中心向外传播的亮度增强）
      let sparkBoost = 1.0;
      if (!reducedMotion) {
        const spark = Math.sin(sparkPhase - p.r * 7.0);
        if (spark > 0.8) sparkBoost = 1.0 + (spark - 0.8) * 3.5;
      }

      const brightness = depthFactor * twinkle * sparkBoost;
      const [cr, cg, cb] = tempColor(NODE_COLOR[p.kind], p.r);

      if (p.isCore) {
        // 核心粒子：白热光晕 + 大 sprite
        const spriteSize = p.size * 14 * pulse * persp * sparkBoost;
        ctx.globalAlpha = Math.min(0.9, (0.5 + p.activation * 0.3) * pulse * depthFactor * burstAlpha);
        ctx.drawImage(coreSprite, finalX - spriteSize / 2, finalY - spriteSize / 2, spriteSize, spriteSize);

        // 核心纯白点
        ctx.globalAlpha = Math.min(1, pulse * 0.9 * depthFactor * twinkle * burstAlpha);
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse * twinkle * burstAlpha})`;
        ctx.beginPath();
        ctx.arc(finalX, finalY, Math.max(0.8, p.size * 0.8 * persp), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 普通粒子：彩色光晕
        const distFade = Math.max(0.5, 1 - p.r * 0.4); // 外围粒子稍暗
        const spriteSize = p.size * 8 * pulse * persp * distFade;
        const alpha = (0.35 + p.activation * 0.35) * pulse * brightness * burstAlpha;

        ctx.globalAlpha = Math.min(0.85, alpha);
        ctx.drawImage(particleSprite, finalX - spriteSize / 2, finalY - spriteSize / 2, spriteSize, spriteSize);

        // 粒子核心点（彩色）
        ctx.globalAlpha = Math.min(1, alpha * 1.8);
        ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
        ctx.beginPath();
        ctx.arc(finalX, finalY, Math.max(0.6, p.size * 0.6 * persp), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // === 4b. 能量丝线（近邻亮粒子间的曲线连接 + 流动信号光点） ===
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const fil of filaments) {
      const pa = particles[fil.startIdx];
      const pb = particles[fil.endIdx];
      if (!pa || !pb) continue;

      // 计算两端粒子的屏幕坐标
      const aAng = baseRotation * (1.0 / (0.3 + pa.r * 0.7));
      const aTheta = pa.theta + aAng;
      const aOrgR = pa.r * (1 + Math.sin(aTheta * 3 + pa.phase) * 0.03);
      const [ax1, ay1, az1] = rotY(Math.cos(aTheta) * aOrgR, Math.sin(aTheta) * aOrgR, pa.z, viewYaw);
      const [ax2, ay2, az2] = rotX(ax1, ay1, az1, viewPitch);
      const aPersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + az2));
      const aSx = cx + ax2 * scale * aPersp;
      const aSy = cy + ay2 * scale * aPersp;

      const bAng = baseRotation * (1.0 / (0.3 + pb.r * 0.7));
      const bTheta = pb.theta + bAng;
      const bOrgR = pb.r * (1 + Math.sin(bTheta * 3 + pb.phase) * 0.03);
      const [bx1, by1, bz1] = rotY(Math.cos(bTheta) * bOrgR, Math.sin(bTheta) * bOrgR, pb.z, viewYaw);
      const [bx2, by2, bz2] = rotX(bx1, by1, bz1, viewPitch);
      const bPersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + bz2));
      const bSx = cx + bx2 * scale * bPersp;
      const bSy = cy + by2 * scale * bPersp;

      // 跳过过长的连接（透视后距离过大）
      const screenDist = Math.hypot(bSx - aSx, bSy - aSy);
      if (screenDist > 120 || screenDist < 2) continue;

      // 贝塞尔控制点（中点 + 偏移）
      const midX = (aSx + bSx) / 2;
      const midY = (aSy + bSy) / 2;
      const perpX = -(bSy - aSy) / screenDist;
      const perpY = (bSx - aSx) / screenDist;
      const ctrlX = midX + perpX * fil.ctrlOffset * scale;
      const ctrlY = midY + perpY * fil.ctrlOffset * scale;

      // 丝线底色（微弱）
      const filAlpha = 0.06 * aPersp * burstAlpha;
      ctx.globalAlpha = filAlpha;
      ctx.strokeStyle = 'rgba(0, 210, 140, 0.5)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(aSx, aSy);
      ctx.quadraticCurveTo(ctrlX, ctrlY, bSx, bSy);
      ctx.stroke();

      // 流动信号光点（沿曲线移动）
      const signalT = (Math.sin(frame * fil.signalSpeed + fil.phase) + 1) / 2;
      // 二次贝塞尔曲线上的点
      const sX = (1 - signalT) * (1 - signalT) * aSx + 2 * (1 - signalT) * signalT * ctrlX + signalT * signalT * bSx;
      const sY = (1 - signalT) * (1 - signalT) * aSy + 2 * (1 - signalT) * signalT * ctrlY + signalT * signalT * bSy;
      const signalAlpha = (0.3 + 0.3 * Math.sin(frame * fil.signalSpeed * 2 + fil.phase)) * aPersp * burstAlpha;
      ctx.globalAlpha = Math.min(0.8, signalAlpha);
      ctx.fillStyle = 'rgba(150, 255, 210, 0.9)';
      ctx.beginPath();
      ctx.arc(sX, sY, Math.max(0.8, 1.5 * aPersp), 0, Math.PI * 2);
      ctx.fill();
    }

    // === 5. 中心胞体核心光晕（多层径向渐变 + 脉冲光射线） ===
    // 核心位于星系原点 (0,0,0)
    const [cx1, cy1, cz1] = rotY(0, 0, 0, viewYaw);
    const [cx2, cy2, cz2] = rotX(cx1, cy1, cz1, viewPitch);
    const corePersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + cz2));
    const coreScreenX = cx + cx2 * scale * corePersp;
    const coreScreenY = cy + cy2 * scale * corePersp;

    ctx.globalCompositeOperation = 'lighter';
    // 核心脉动：周期性亮度变化，爆发期间额外增强
    const coreBurstBoost = burstProgress < 0.3 ? (1 + (0.3 - burstProgress) * 3) : 1;
    const corePulse = (0.22 + Math.sin(frame * 0.8) * 0.1) * coreBurstBoost;
    const coreRadius = scale * 0.18 * corePersp;

    // 第一层：大范围外光晕（翡翠绿弥散）
    ctx.globalAlpha = Math.min(0.6, corePulse * 0.7 * corePersp * burstAlpha);
    const outerGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius * 1.8);
    outerGrad.addColorStop(0, 'rgba(0, 210, 106, 0.12)');
    outerGrad.addColorStop(0.3, 'rgba(0, 180, 90, 0.06)');
    outerGrad.addColorStop(0.7, 'rgba(0, 140, 70, 0.02)');
    outerGrad.addColorStop(1, 'rgba(0, 100, 50, 0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 第二层：中圈翡翠光晕
    ctx.globalAlpha = Math.min(0.7, corePulse * corePersp * burstAlpha);
    const midGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius);
    midGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    midGrad.addColorStop(0.15, 'rgba(180, 255, 220, 0.14)');
    midGrad.addColorStop(0.4, 'rgba(0, 210, 106, 0.16)');
    midGrad.addColorStop(0.75, 'rgba(0, 160, 80, 0.05)');
    midGrad.addColorStop(1, 'rgba(0, 120, 60, 0)');
    ctx.fillStyle = midGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // 第三层：核心白热点（最小最亮）
    const innerRadius = coreRadius * 0.35;
    ctx.globalAlpha = Math.min(0.9, corePulse * 1.5 * corePersp * burstAlpha);
    const innerGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, innerRadius);
    innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    innerGrad.addColorStop(0.3, 'rgba(220, 255, 240, 0.2)');
    innerGrad.addColorStop(1, 'rgba(150, 255, 200, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // 脉冲光射线（从核心向外辐射的旋转光线）
    if (!reducedMotion && burstProgress > 0.3) {
      const rayCount = 6;
      const rayRotation = frame * 0.15;
      const rayLength = coreRadius * 2.5;
      const rayPulse = 0.5 + 0.5 * Math.sin(frame * 0.8);
      ctx.globalAlpha = 0.04 * rayPulse * corePersp * burstAlpha;
      ctx.strokeStyle = 'rgba(150, 255, 210, 0.6)';
      ctx.lineWidth = 1.5;
      for (let r = 0; r < rayCount; r++) {
        const angle = rayRotation + (r / rayCount) * Math.PI * 2;
        const ex = coreScreenX + Math.cos(angle) * rayLength;
        const ey = coreScreenY + Math.sin(angle) * rayLength;
        const rayGrad = ctx.createLinearGradient(coreScreenX, coreScreenY, ex, ey);
        rayGrad.addColorStop(0, 'rgba(150, 255, 210, 0.3)');
        rayGrad.addColorStop(0.5, 'rgba(0, 210, 106, 0.1)');
        rayGrad.addColorStop(1, 'rgba(0, 210, 106, 0)');
        ctx.strokeStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(coreScreenX, coreScreenY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, [state, particleSprite, coreSprite, nebulaGlowSprite, reducedMotion]);

  // 动画循环（节流到 ~30fps）
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

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // 自动隐藏拖拽提示
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  // === 拖拽交互处理器 ===

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    // 捕获指针，确保拖拽过程中不丢失事件
    try { container.setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current.isDragging = true;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.velX = 0;
    dragRef.current.velY = 0;
    dragRef.current.pointerId = e.pointerId;
    setIsDragging(true);
    interactedRef.current = true;
    setShowHint(false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;

    if (drag.isDragging) {
      // 拖拽中：更新视角
      const deltaX = e.clientX - drag.lastX;
      const deltaY = e.clientY - drag.lastY;
      const sensitivity = 0.006;

      viewRef.current.targetYaw += deltaX * sensitivity;
      viewRef.current.targetPitch += deltaY * sensitivity;
      viewRef.current.targetPitch = clamp(viewRef.current.targetPitch, -1.35, 1.35);

      // 记录速度用于惯性
      drag.velX = deltaX * sensitivity * 0.5;
      drag.velY = deltaY * sensitivity * 0.5;

      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    } else {
      // 非拖拽：悬停检测
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height * 0.42;
      const scale = Math.min(rect.width, rect.height) * 1.1;
      const view = viewRef.current;
      const frame = performance.now() / 1000;
      const baseRotation = reducedMotion ? 0 : frame * 0.04;

      const { particles } = galaxyRef.current;
      let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;

      for (const p of particles) {
        const angularVel = baseRotation * (1.0 / (0.3 + p.r * 0.7));
        const currentTheta = p.theta + angularVel;
        const organicR = p.r * (1 + Math.sin(currentTheta * 3 + p.phase) * 0.03);
        const lx = Math.cos(currentTheta) * organicR;
        const ly = Math.sin(currentTheta) * organicR;
        const lz = p.z;
        const [x1, y1, z1] = rotY(lx, ly, lz, view.yaw);
        const [x2, y2, z2] = rotX(x1, y1, z1, view.pitch);
        const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
        const px = cx + x2 * scale * persp;
        const py = cy + y2 * scale * persp;
        const d = Math.hypot(x - px, y - py);
        if (d < 20 && (!best || d < best.d)) {
          best = { kind: p.kind, x: px, y: py, d };
        }
      }
      if (best) {
        setHoverInfo({ kind: best.kind, x: best.x, y: best.y });
      } else {
        setHoverInfo(null);
      }
    }
  }, [reducedMotion]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId === e.pointerId || drag.isDragging) {
      const container = containerRef.current;
      if (container) {
        try { container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      }
      drag.isDragging = false;
      drag.pointerId = -1;
      setIsDragging(false);
    }
  }, []);

  // 双击重置视角
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
          style={{
            left: hoverInfo.x + 12,
            top: hoverInfo.y - 24,
            transform: 'translateX(-50%)',
          }}
        >
          {kindLabels[hoverInfo.kind]}
        </div>
      )}
      {showHint && (
        <div
          className="life-core__drag-hint pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-glass)] px-3 py-1 text-xs text-[var(--color-text-tertiary)] backdrop-blur-glass"
        >
          拖拽旋转星系 · 双击重置 ✦
        </div>
      )}
    </div>
  );
}

export default LifeCoreCanvas;
