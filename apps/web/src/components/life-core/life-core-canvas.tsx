'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 神经元粒子云 V8 (Neuron Cloud · TouchDesigner Inspired)
 * ─────────────────────────────────────────────────────────────
 * 复刻 Bilibili BV1ow4m1Y7qu 粒子云神经元效果
 *
 * V8 视觉特征：
 * - 从中心向外辐射的粒子流，跟随 curl noise 有机路径流动
 * - 粒子运动拖尾，形成光迹 streaks
 * - 近邻粒子动态连线，形成树突/轴突状神经网络
 * - 信号光点沿连线流动，模拟神经信号传递
 * - 暖色调温度梯度：白热核心 → 翡翠 → 琥珀外缘
 * - 中心爆发式光晕 + 脉冲能量波 + 旋转光射线
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

// ═══════════════════════════════════════════
// 粒子结构 — 流动神经元粒子
// ═══════════════════════════════════════════

interface NeuronParticle {
  kind: NodeKind;
  // 3D 笛卡尔坐标（归一化空间 -1~1）
  x: number;
  y: number;
  z: number;
  // 速度
  vx: number;
  vy: number;
  vz: number;
  // 生命周期
  life: number;
  maxLife: number;
  // 视觉属性
  size: number;
  phase: number;
  pulseSpeed: number;
  twinkleSpeed: number;
  twinklePhase: number;
  // 噪声偏移（让每个粒子的流动路径不同）
  noiseOffset: number;
  // 拖尾
  trail: { x: number; y: number; z: number }[];
  trailMax: number;
  // 是否为核心粒子
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
 * Curl noise 近似 — 用正弦波叠加模拟流体噪声场
 * 让粒子产生有机的流动路径
 */
function curlNoise(x: number, y: number, z: number, t: number): [number, number, number] {
  const s = 0.8;
  const nx = Math.sin(y * s + t * 0.3) * Math.cos(z * s * 0.7 + t * 0.2) +
             Math.sin(y * s * 2.1 + t * 0.5) * 0.3;
  const ny = Math.sin(z * s + t * 0.4) * Math.cos(x * s * 0.7 + t * 0.3) +
             Math.sin(z * s * 1.8 + t * 0.6) * 0.3;
  const nz = Math.sin(x * s + t * 0.2) * Math.cos(y * s * 0.7 + t * 0.4) +
             Math.sin(x * s * 2.3 + t * 0.35) * 0.3;
  return [nx, ny, nz];
}

/**
 * 色彩温度梯度：根据粒子距核心的距离调整颜色
 * - dist < 0.1：核心区白热化（向白色混合）
 * - 0.1 ~ 0.5：保持种类基色
 * - dist > 0.5：外缘冷却变暗（向深色偏移）
 */
function tempColor(base: [number, number, number], dist: number): [number, number, number] {
  if (dist < 0.1) {
    const t = 1 - dist / 0.1;
    const w = t * 0.7;
    return [
      Math.round(base[0] + (255 - base[0]) * w),
      Math.round(base[1] + (255 - base[1]) * w),
      Math.round(base[2] + (255 - base[2]) * w),
    ];
  }
  if (dist > 0.5) {
    const t = Math.min(1, (dist - 0.5) / 0.5);
    const target: [number, number, number] = [
      Math.round(base[0] * 0.45),
      Math.round(base[1] * 0.35),
      Math.round(base[2] * 0.3),
    ];
    const w = t * 0.5;
    return [
      Math.round(base[0] + (target[0] - base[0]) * w),
      Math.round(base[1] + (target[1] - base[1]) * w),
      Math.round(base[2] + (target[2] - base[2]) * w),
    ];
  }
  return base;
}

// ═══════════════════════════════════════════
// 粒子重置 & 更新
// ═══════════════════════════════════════════

function resetParticle(p: NeuronParticle, rand: () => number) {
  // 从中心附近发射，带径向速度
  const angle = rand() * Math.PI * 2;
  const startR = rand() * 0.05;
  p.x = Math.cos(angle) * startR;
  p.y = Math.sin(angle) * startR;
  p.z = (rand() - 0.5) * 0.02;

  // 初始径向速度
  const speed = 0.003 + rand() * 0.008;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.vz = (rand() - 0.5) * 0.001;

  // 生命周期
  p.life = 0;
  p.maxLife = 200 + rand() * 300;

  // 视觉属性
  p.size = 0.8 + rand() * 1.5;
  p.phase = rand() * Math.PI * 2;
  p.pulseSpeed = 0.5 + rand() * 1.0;
  p.twinkleSpeed = 2 + rand() * 4;
  p.twinklePhase = rand() * Math.PI * 2;
  p.isCore = false;

  // 拖尾
  p.trail = [];
  p.trailMax = 6 + Math.floor(rand() * 6);

  // 噪声偏移
  p.noiseOffset = rand() * 100;
}

function updateParticle(p: NeuronParticle, t: number, dt: number) {
  p.life += dt;

  // Curl noise 影响速度方向（有机流动）
  const noise = curlNoise(
    p.x * 3 + p.noiseOffset,
    p.y * 3,
    p.z * 3,
    t + p.noiseOffset,
  );

  // 噪声力强度（随距离衰减，近核心更强）
  const dist = Math.hypot(p.x, p.y, p.z);
  const noiseStrength = 0.0008 * (1 + 1 / (0.1 + dist));

  p.vx += noise[0] * noiseStrength;
  p.vy += noise[1] * noiseStrength;
  p.vz += noise[2] * noiseStrength;

  // 轻微向心力（让粒子不会飞太远，形成球状云团）
  if (dist > 0.6) {
    const pull = (dist - 0.6) * 0.003;
    p.vx -= (p.x / dist) * pull;
    p.vy -= (p.y / dist) * pull;
    p.vz -= (p.z / dist) * pull;
  }

  // 阻尼
  p.vx *= 0.985;
  p.vy *= 0.985;
  p.vz *= 0.985;

  // 更新位置
  p.x += p.vx;
  p.y += p.vy;
  p.z += p.vz;

  // 记录拖尾
  p.trail.push({ x: p.x, y: p.y, z: p.z });
  if (p.trail.length > p.trailMax) p.trail.shift();

  // 重生
  if (p.life > p.maxLife || dist > 1.2) {
    const rand = mulberry32(Math.floor(p.life * 1000 + p.noiseOffset));
    resetParticle(p, rand);
  }
}

// ═══════════════════════════════════════════
// 构建神经元粒子云
// ═══════════════════════════════════════════

function buildNeuronCloud(counts: LifeCoreCounts, level: number): {
  particles: NeuronParticle[];
  bgStars: BgStar[];
  stemPoints: { x: number; y: number; z: number }[];
} {
  const rand = mulberry32(42 + level * 7);
  // 粒子数量：800 个，沉浸式神经元云
  const total = Math.min(800, 500 + (counts.memory + counts.event + counts.knowledge + counts.agent) * 8 + level * 10);

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

  // 创建粒子
  const particles: NeuronParticle[] = [];
  for (let i = 0; i < total; i++) {
    const p: NeuronParticle = {
      kind: kindPool[i] || 'agent',
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0,
      maxLife: 300,
      size: 1,
      phase: 0,
      pulseSpeed: 0.5,
      twinkleSpeed: 3,
      twinklePhase: 0,
      noiseOffset: 0,
      trail: [],
      trailMax: 8,
      isCore: false,
    };
    resetParticle(p, rand);
    // 错开初始生命，避免同时重生
    p.life = rand() * 200;
    // 随机分布一部分粒子到外围（初始已有结构）
    if (i < total * 0.3) {
      const angle = rand() * Math.PI * 2;
      const r = 0.1 + rand() * 0.5;
      p.x = Math.cos(angle) * r;
      p.y = Math.sin(angle) * r;
      p.z = (rand() - 0.5) * 0.1;
    }
    // 核心粒子标记
    if (i < total * 0.08) {
      p.isCore = true;
      p.size *= 1.5;
    }
    particles.push(p);
  }

  // 背景星场
  const bgStars: BgStar[] = [];
  for (let i = 0; i < 150; i++) {
    bgStars.push({
      x: (rand() - 0.5) * 3,
      y: (rand() - 0.5) * 3,
      z: (rand() - 0.5) * 0.5,
      size: 0.3 + rand() * 0.5,
      brightness: 0.04 + rand() * 0.12,
      twinkleSpeed: 0.3 + rand() * 0.9,
      twinklePhase: rand() * Math.PI * 2,
    });
  }

  // 轴突茎：从中心向下延伸
  const stemPoints: { x: number; y: number; z: number }[] = [];
  const stemSegments = 10;
  for (let i = 0; i <= stemSegments; i++) {
    const t = i / stemSegments;
    stemPoints.push({
      x: Math.sin(t * 1.5) * 0.015 * (1 - t * 0.5),
      y: 0.15 + t * 0.35,
      z: 0,
    });
  }

  return { particles, bgStars, stemPoints };
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

  const cloud = useMemo(() => buildNeuronCloud(counts, level), [counts, level]);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;

  // 拖拽状态
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

  // 上一帧时间（用于 dt 计算）
  const lastFrameRef = useRef<number>(0);

  // 初始爆发动画起始时间戳
  const startTimeRef = useRef<number>(0);
  const BURST_DURATION = 2.5;

  // 屏幕坐标缓存（用于 hover 检测）
  const screenPositionsRef = useRef<Array<{ kind: NodeKind; sx: number; sy: number }>>([]);

  // 是否已交互过
  const interactedRef = useRef(false);

  // 预渲染粒子 sprite
  const [particleSprite, setParticleSprite] = useState<HTMLCanvasElement | null>(null);
  const [coreSprite, setCoreSprite] = useState<HTMLCanvasElement | null>(null);
  const [glowSprite, setGlowSprite] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 标准粒子光晕 sprite — 白色中心 + 翡翠绿边缘
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(220,255,240,0.7)');
    grad.addColorStop(0.4, 'rgba(100,255,180,0.2)');
    grad.addColorStop(1, 'rgba(0,210,106,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    setParticleSprite(canvas);

    // 核心粒子 sprite — 白热中心 + 翡翠绿光晕
    const coreSize = 128;
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = coreSize;
    coreCanvas.height = coreSize;
    const cctx = coreCanvas.getContext('2d')!;
    const coreGrad = cctx.createRadialGradient(coreSize / 2, coreSize / 2, 0, coreSize / 2, coreSize / 2, coreSize / 2);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.1, 'rgba(220,255,240,0.85)');
    coreGrad.addColorStop(0.25, 'rgba(150,255,200,0.4)');
    coreGrad.addColorStop(0.5, 'rgba(0,210,106,0.15)');
    coreGrad.addColorStop(1, 'rgba(0,210,106,0)');
    cctx.fillStyle = coreGrad;
    cctx.fillRect(0, 0, coreSize, coreSize);
    setCoreSprite(coreCanvas);

    // 背景光晕 sprite — 大范围翡翠绿辉光
    const glowSize = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize;
    glowCanvas.height = glowSize;
    const gctx = glowCanvas.getContext('2d')!;
    const glowGrad = gctx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
    glowGrad.addColorStop(0, 'rgba(0,210,106,0.15)');
    glowGrad.addColorStop(0.15, 'rgba(0,210,106,0.1)');
    glowGrad.addColorStop(0.35, 'rgba(0,180,90,0.05)');
    glowGrad.addColorStop(0.65, 'rgba(0,140,80,0.02)');
    glowGrad.addColorStop(1, 'rgba(0,100,60,0)');
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

    const { particles, bgStars, stemPoints } = cloudRef.current;
    if (!particles.length || !particleSprite || !coreSprite || !glowSprite) return;

    // 帧时间 & dt
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
    const galaxyScale = Math.min(width, height) * 1.1;

    // 初始爆发动画进度
    const elapsed = frame - startTimeRef.current;
    const burstProgress = reducedMotion ? 1 : Math.min(1, elapsed / BURST_DURATION);
    const burstEase = burstProgress === 1 ? 1 : 1 - Math.pow(2, -10 * burstProgress);
    const burstScale = 0.05 + burstEase * 0.95;
    const burstSpin = reducedMotion ? 0 : (1 - burstEase) * 3.0;
    const burstAlpha = reducedMotion ? 1 : Math.min(1, burstProgress * 1.5);

    // 星系整体呼吸
    const breath = state === 'companion'
      ? 0.97 + Math.sin(frame * 0.6) * 0.03
      : state === 'learning'
      ? 1.0 + Math.sin(frame * 1.2) * 0.06
      : state === 'recalling'
      ? 0.93 + Math.sin(frame * 1.6) * 0.08
      : 1.04 + Math.sin(frame * 0.5) * 0.05;

    const scale = galaxyScale * breath * burstScale;

    // 视角更新
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
    const autoRot = reducedMotion ? 0 : (frame * 0.03 + burstSpin);
    const sparkPhase = reducedMotion ? 0 : frame * 0.5;

    // ═══ 1. 背景星场（视差旋转） ═══
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
      ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, star.size * persp), 0, Math.PI * 2);
      ctx.fill();
    }

    // ═══ 2. 背景光晕 ═══
    ctx.globalAlpha = 0.5 * burstAlpha;
    const gw = scale * 2.2, gh = scale * 1.9;
    ctx.drawImage(glowSprite, cx - gw / 2, cy - gh / 2, gw, gh);

    // ═══ 3. 更新粒子 ═══
    if (!reducedMotion) {
      const dtScaled = dt * 60;
      for (const p of particles) {
        updateParticle(p, frame, dtScaled);
      }
    }

    // ═══ 4. 计算粒子屏幕坐标 ═══
    const screenData: Array<{
      p: NeuronParticle;
      sx: number;
      sy: number;
      persp: number;
      dist: number;
    }> = [];

    for (const p of particles) {
      const [x1, y1, z1] = rotY(p.x, p.y, p.z, viewYaw + autoRot * 0.3);
      const [x2, y2, z2] = rotX(x1, y1, z1, viewPitch);
      const persp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + z2));
      const dist = Math.hypot(p.x, p.y, p.z);
      screenData.push({
        p,
        sx: cx + x2 * scale * persp * breath * burstScale,
        sy: cy + y2 * scale * persp * breath * burstScale,
        persp,
        dist,
      });
    }

    // 缓存屏幕坐标用于 hover 检测（每帧更新）
    if (screenPositionsRef.current.length !== screenData.length) {
      screenPositionsRef.current = new Array(screenData.length);
    }
    for (let i = 0; i < screenData.length; i++) {
      const sd = screenData[i];
      screenPositionsRef.current[i] = { kind: sd.p.kind, sx: sd.sx, sy: sd.sy };
    }

    // ═══ 5. 粒子拖尾 ═══
    if (!reducedMotion) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const sd of screenData) {
        const p = sd.p;
        if (p.trail.length < 2) continue;
        const [r, g, b] = tempColor(NODE_COLOR[p.kind], clamp(sd.dist, 0, 1));
        for (let i = 1; i < p.trail.length; i++) {
          const t0 = p.trail[i - 1];
          const t1 = p.trail[i];
          const [tx1, ty1, tz1] = rotY(t0.x, t0.y, t0.z, viewYaw + autoRot * 0.3);
          const [tx2, ty2, tz2] = rotX(tx1, ty1, tz1, viewPitch);
          const tp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + tz2));
          const [ux1, uy1, uz1] = rotY(t1.x, t1.y, t1.z, viewYaw + autoRot * 0.3);
          const [ux2, uy2, uz2] = rotX(ux1, uy1, uz1, viewPitch);
          const up = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + uz2));

          const x0 = cx + tx2 * scale * tp * breath * burstScale;
          const y0 = cy + ty2 * scale * tp * breath * burstScale;
          const x1s = cx + ux2 * scale * up * breath * burstScale;
          const y1s = cy + uy2 * scale * up * breath * burstScale;

          const trailAlpha = (i / p.trail.length) * 0.15 * sd.persp * burstAlpha;
          if (trailAlpha < 0.01) continue;
          ctx.globalAlpha = trailAlpha;
          ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
          ctx.lineWidth = (i / p.trail.length) * p.size * sd.persp * 0.8;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1s, y1s);
          ctx.stroke();
        }
      }
    }

    // ═══ 6. 动态连线（神经网络突触） ═══
    const CONNECT_DIST = 0.13;
    const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
    const NEIGHBOR_CHECK = 40; // 每个粒子检查的邻居数

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let i = 0; i < screenData.length; i++) {
      const a = screenData[i];
      for (let j = i + 1; j < Math.min(i + NEIGHBOR_CHECK, screenData.length); j++) {
        const b = screenData[j];
        const dx = a.p.x - b.p.x;
        const dy = a.p.y - b.p.y;
        const dz = a.p.z - b.p.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > CONNECT_DIST_SQ) continue;

        const dist = Math.sqrt(distSq);
        const proximity = 1 - dist / CONNECT_DIST;
        const [r, g, bl] = tempColor(NODE_COLOR[a.p.kind], clamp((a.dist + b.dist) / 2, 0, 1));

        const lineAlpha = proximity * 0.25 * a.persp * burstAlpha;
        if (lineAlpha < 0.01) continue;

        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = `rgba(${r},${g},${bl},0.7)`;
        ctx.lineWidth = proximity * 0.8 * Math.min(a.persp, b.persp);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        // 信号光点（沿连线流动）
        if (proximity > 0.5) {
          const signalT = (Math.sin(frame * 2 + i * 0.3) + 1) / 2;
          const sigX = lerp(a.sx, b.sx, signalT);
          const sigY = lerp(a.sy, b.sy, signalT);
          const sigAlpha = proximity * 0.4 * a.persp * burstAlpha;
          ctx.globalAlpha = sigAlpha;
          ctx.fillStyle = 'rgba(180, 255, 220, 0.9)';
          ctx.beginPath();
          ctx.arc(sigX, sigY, Math.max(0.5, 1.2 * a.persp), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ═══ 7. 轴突茎 ═══
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.2;
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

    // ═══ 8. 粒子渲染 ═══
    ctx.globalCompositeOperation = 'lighter';

    for (const sd of screenData) {
      const p = sd.p;
      const [r, g, b] = tempColor(NODE_COLOR[p.kind], clamp(sd.dist, 0, 1));

      // 闪烁
      const twinkle = reducedMotion ? 1.0 : (0.75 + 0.25 * Math.sin(frame * p.twinkleSpeed + p.twinklePhase));
      // 脉冲
      const pulse = 0.65 + Math.sin(frame * p.pulseSpeed + p.phase) * 0.35;
      // 能量脉冲波
      let spark = 1;
      if (!reducedMotion) {
        const sp = Math.sin(sparkPhase - sd.dist * 7);
        if (sp > 0.8) spark = 1 + (sp - 0.8) * 3;
      }

      // 生命周期淡入淡出
      const lifeFade = Math.min(1, p.life / 20) * Math.min(1, (p.maxLife - p.life) / 30);
      const brightness = sd.persp * twinkle * spark * lifeFade * burstAlpha;
      const alpha = (0.4 + 0.3 * pulse) * brightness;

      if (p.isCore) {
        // 核心粒子：白热光晕 + 大 sprite
        const spriteSize = p.size * 14 * pulse * sd.persp * spark;
        ctx.globalAlpha = Math.min(0.9, alpha);
        ctx.drawImage(coreSprite, sd.sx - spriteSize / 2, sd.sy - spriteSize / 2, spriteSize, spriteSize);
        // 核心纯白点
        ctx.globalAlpha = Math.min(1, alpha * 1.5);
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse * twinkle * burstAlpha})`;
        ctx.beginPath();
        ctx.arc(sd.sx, sd.sy, Math.max(0.8, p.size * 0.8 * sd.persp), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 普通粒子：彩色光晕
        const distFade = Math.max(0.5, 1 - sd.dist * 0.4);
        const spriteSize = p.size * 10 * pulse * sd.persp * distFade;
        ctx.globalAlpha = Math.min(0.85, alpha);
        ctx.drawImage(particleSprite, sd.sx - spriteSize / 2, sd.sy - spriteSize / 2, spriteSize, spriteSize);
        // 粒子核心点（彩色）
        ctx.globalAlpha = Math.min(1, alpha * 1.8);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(sd.sx, sd.sy, Math.max(0.6, p.size * 0.7 * sd.persp), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ═══ 9. 中心核心光晕（多层径向渐变 + 脉冲光射线） ═══
    const [ccx1, ccy1, ccz1] = rotY(0, 0, 0, viewYaw);
    const [ccx2, ccy2, ccz2] = rotX(ccx1, ccy1, ccz1, viewPitch);
    const corePersp = Math.max(0.1, FOCAL_LENGTH / (FOCAL_LENGTH + ccz2));
    const coreScreenX = cx + ccx2 * scale * corePersp;
    const coreScreenY = cy + ccy2 * scale * corePersp;

    ctx.globalCompositeOperation = 'lighter';
    const coreBurstBoost = burstProgress < 0.3 ? (1 + (0.3 - burstProgress) * 3) : 1;
    const corePulse = (0.25 + Math.sin(frame * 0.8) * 0.12) * coreBurstBoost;
    const coreRadius = scale * 0.16 * corePersp;

    // 外层弥散光晕
    ctx.globalAlpha = Math.min(0.6, corePulse * 0.7 * corePersp * burstAlpha);
    const outerGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius * 2);
    outerGrad.addColorStop(0, 'rgba(0, 210, 106, 0.12)');
    outerGrad.addColorStop(0.3, 'rgba(0, 180, 90, 0.06)');
    outerGrad.addColorStop(0.7, 'rgba(0, 140, 70, 0.02)');
    outerGrad.addColorStop(1, 'rgba(0, 100, 50, 0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // 中层翡翠光晕
    ctx.globalAlpha = Math.min(0.7, corePulse * corePersp * burstAlpha);
    const midGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius);
    midGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    midGrad.addColorStop(0.15, 'rgba(180, 255, 220, 0.15)');
    midGrad.addColorStop(0.4, 'rgba(0, 210, 106, 0.16)');
    midGrad.addColorStop(0.75, 'rgba(0, 160, 80, 0.05)');
    midGrad.addColorStop(1, 'rgba(0, 120, 60, 0)');
    ctx.fillStyle = midGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // 核心 sprite
    ctx.globalAlpha = Math.min(0.9, corePulse * 1.2 * burstAlpha);
    const csSize = coreRadius * 1.5;
    ctx.drawImage(coreSprite, coreScreenX - csSize / 2, coreScreenY - csSize / 2, csSize, csSize);

    // 核心白热点
    ctx.globalAlpha = Math.min(1, corePulse * 1.8 * burstAlpha);
    const innerGrad = ctx.createRadialGradient(coreScreenX, coreScreenY, 0, coreScreenX, coreScreenY, coreRadius * 0.3);
    innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    innerGrad.addColorStop(0.5, 'rgba(220, 255, 240, 0.15)');
    innerGrad.addColorStop(1, 'rgba(150, 255, 200, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(coreScreenX, coreScreenY, coreRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 脉冲光射线
    if (!reducedMotion && burstProgress > 0.3) {
      const rayCount = 6;
      const rayRotation = frame * 0.12;
      const rayLen = coreRadius * 3;
      const rayPulse = 0.5 + 0.5 * Math.sin(frame * 0.8);
      ctx.globalAlpha = 0.05 * rayPulse * burstAlpha;
      ctx.lineWidth = 1.5;
      for (let r = 0; r < rayCount; r++) {
        const angle = rayRotation + (r / rayCount) * Math.PI * 2;
        const ex = coreScreenX + Math.cos(angle) * rayLen;
        const ey = coreScreenY + Math.sin(angle) * rayLen;
        const rayGrad = ctx.createLinearGradient(coreScreenX, coreScreenY, ex, ey);
        rayGrad.addColorStop(0, 'rgba(180, 255, 220, 0.3)');
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
  }, [state, particleSprite, coreSprite, glowSprite, reducedMotion]);

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
      const deltaX = e.clientX - drag.lastX;
      const deltaY = e.clientY - drag.lastY;
      const sensitivity = 0.006;

      viewRef.current.targetYaw += deltaX * sensitivity;
      viewRef.current.targetPitch += deltaY * sensitivity;
      viewRef.current.targetPitch = clamp(viewRef.current.targetPitch, -1.35, 1.35);

      drag.velX = deltaX * sensitivity * 0.5;
      drag.velY = deltaY * sensitivity * 0.5;

      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    } else {
      // 悬停检测：使用缓存的屏幕坐标
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
      if (best) {
        setHoverInfo({ kind: best.kind, x: best.x, y: best.y });
      } else {
        setHoverInfo(null);
      }
    }
  }, []);

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
          拖拽旋转神经元云 · 双击重置 ✦
        </div>
      )}
    </div>
  );
}

export default LifeCoreCanvas;
