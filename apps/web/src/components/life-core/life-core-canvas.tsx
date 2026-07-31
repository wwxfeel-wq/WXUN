'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 螺旋星系粒子云 V6 (3D Interactive)
 * ─────────────────────────────────────────────────────────────
 * 参考风格：BLUE YARD 粒子星系 + 3D 交互旋转
 *
 * 核心升级：
 * - 真 3D 坐标空间：粒子分布在薄盘状星系中，带 Z 轴深度
 * - 透视投影：近大远小，近亮远暗（深度雾化）
 * - 拖拽旋转：水平拖拽 → yaw（偏航），垂直拖拽 → pitch（俯仰）
 * - 惯性衰减：松手后旋转继续滑动，逐渐减速
 * - 双击重置：恢复默认视角
 * - 闪烁效果：每个粒子有独立的闪烁频率和相位
 * - 能量脉冲波：亮度波从中心向外传播，模拟能量流动
 * - 核心脉动：中心光晕周期性脉动
 * - 背景星场：远景星星视差旋转，增加深度感
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
 * 构建螺旋星系粒子云（3D 版）
 * - 超密核心：极端集中的中心区域，Z 厚度稍大
 * - 密集内环：环形高密度区
 * - 螺旋臂：3 条不对称旋臂向外延伸
 * - 稀疏光晕：边缘逐渐稀疏的粒子
 */
function buildGalaxy(counts: LifeCoreCounts, level: number): {
  particles: Particle[];
  stemPoints: { x: number; y: number; z: number }[];
  bgStars: BgStar[];
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

  return { particles, stemPoints, bgStars };
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

    const { particles, stemPoints, bgStars } = galaxyRef.current;
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
      const [cr, cg, cb] = NODE_COLOR[p.kind];

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

    // === 5. 中心胞体核心光晕（3D 投影到屏幕） ===
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
    ctx.globalAlpha = Math.min(0.8, corePulse * corePersp * burstAlpha);
    const coreRadius = scale * 0.15 * corePersp;
    const coreGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    coreGrad.addColorStop(0.2, 'rgba(0, 210, 106, 0.18)');
    coreGrad.addColorStop(0.6, 'rgba(0, 180, 90, 0.06)');
    coreGrad.addColorStop(1, 'rgba(0, 140, 70, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

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
