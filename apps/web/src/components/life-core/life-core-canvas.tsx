'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 螺旋星系粒子云 V5
 * ─────────────────────────────────────────────────────────────
 * 参考风格：BLUE YARD 粒子星系
 * - 螺旋星系分布：超密核心 → 密集内环 → 螺旋臂 → 稀疏光晕
 * - 无显式连线，通过粒子密度和加法混合暗示结构
 * - 强发光粒子，重叠区域产生连续光晕体
 * - 缓慢自转，粒子沿螺旋臂漂移
 * - 中心白热，外围翡翠绿，保持品牌色彩
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
  theta: number;    // 角度 0~2π
  // 螺旋臂偏移（用于自转时不同半径角速度不同）
  armOffset: number;
  // 基础大小系数
  size: number;
  // 相位（用于脉冲动画）
  phase: number;
  // 脉冲速度
  pulseSpeed: number;
  // 漂移幅度
  driftAmp: number;
  driftPhase: number;
  // 激活度 0~1
  activation: number;
  // 是否为核心粒子（白热）
  isCore: boolean;
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

/**
 * 构建螺旋星系粒子云
 * 参考图分析：
 * - 超密核心：极端集中的中心区域
 * - 密集内环：环形高密度区
 * - 螺旋臂：2-3 条不对称旋臂向外延伸
 * - 稀疏光晕：边缘逐渐稀疏的粒子
 */
function buildGalaxy(counts: LifeCoreCounts, level: number): {
  particles: Particle[];
  stemPoints: { x: number; y: number }[];
} {
  const rand = mulberry32(42 + level * 7);
  // 粒子数量：280 个，平衡视觉效果和性能
  const total = Math.min(280, 120 + (counts.memory + counts.event + counts.knowledge + counts.agent) * 5 + level * 8);

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
      // 内环粒子也跟随螺旋臂，但偏移较小
      const arm = Math.floor(rand() * armCount);
      const armBase = (arm / armCount) * Math.PI * 2;
      theta = armBase + r * winding + (rand() - 0.5) * 0.6;
    } else if (randVal < 0.85) {
      // 45% 粒子在螺旋臂（r 0.30~0.75）
      r = 0.30 + Math.pow(rand(), 0.5) * 0.45;
      const arm = Math.floor(rand() * armCount);
      const armBase = (arm / armCount) * Math.PI * 2;
      // 螺旋臂方程：theta = armBase + r * winding + 散射
      const scatter = (rand() - 0.5) * 0.5 * (1 - r * 0.5); // 外围散射更大
      theta = armBase + r * winding + scatter;
    } else {
      // 15% 粒子在稀疏光晕（r 0.75~1.0）
      r = 0.75 + rand() * 0.25;
      theta = rand() * Math.PI * 2;
    }

    // 粒子大小：核心区域更大更亮，外围更小
    const sizeBase = isCore ? 1.4 : (r < 0.3 ? 1.1 : (r < 0.6 ? 0.9 : 0.7));
    const size = sizeBase + rand() * 0.3;

    particles.push({
      kind: kindPool[i] || 'agent',
      r,
      theta,
      armOffset: theta, // 记录初始角度，用于自转
      size,
      phase: rand() * Math.PI * 2,
      pulseSpeed: 0.2 + rand() * 0.4,
      driftAmp: 0.002 + rand() * 0.004,
      driftPhase: rand() * Math.PI * 2,
      activation: 0.3 + rand() * 0.3,
      isCore,
    });
  }

  // 轴突茎：从星系底部向下延伸（保留神经元概念，但更纤细）
  const stemPoints: { x: number; y: number }[] = [];
  const stemSegments = 10;
  for (let i = 0; i <= stemSegments; i++) {
    const t = i / stemSegments;
    const curveX = Math.sin(t * 1.5) * 0.015 * (1 - t * 0.5);
    stemPoints.push({
      x: curveX,
      y: 0.15 + t * 0.45,
    });
  }

  return { particles, stemPoints };
}

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

  const galaxy = useMemo(() => buildGalaxy(counts, level), [counts, level]);
  const galaxyRef = useRef(galaxy);
  galaxyRef.current = galaxy;

  // 预渲染粒子sprite
  const [particleSprite, setParticleSprite] = useState<HTMLCanvasElement | null>(null);
  const [coreSprite, setCoreSprite] = useState<HTMLCanvasElement | null>(null);
  const [nebulaGlowSprite, setNebulaGlowSprite] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 标准粒子光晕sprite — 柔和的径向渐变
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

    // 核心粒子sprite — 更大更亮，白热中心
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

    const { particles, stemPoints } = galaxyRef.current;
    if (!particles.length || !particleSprite || !coreSprite || !nebulaGlowSprite) return;

    const frame = performance.now() / 1000;
    const cx = width / 2;
    const cy = height * 0.44;
    const galaxyScale = Math.min(width, height) * 0.78;

    // 星系整体呼吸
    const breath = state === 'companion'
      ? 0.96 + Math.sin(frame * 0.6) * 0.04
      : state === 'learning'
      ? 1.0 + Math.sin(frame * 1.2) * 0.06
      : state === 'recalling'
      ? 0.93 + Math.sin(frame * 1.6) * 0.08
      : 1.04 + Math.sin(frame * 0.5) * 0.05;

    const scale = galaxyScale * breath;

    // 缓慢自转角速度（参考图风格：极慢旋转）
    // 内圈快、外圈慢（微分自转，类似真实星系）
    const baseRotation = frame * 0.04;

    // === 1. 星云背景光晕（大范围柔和辉光） ===
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    const glowW = scale * 2.2;
    const glowH = scale * 1.9;
    ctx.drawImage(nebulaGlowSprite, cx - glowW / 2, cy - glowH / 2, glowW, glowH);

    // === 2. 轴突茎（纤细的向下延伸，保留神经元概念） ===
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(0, 210, 106, 0.25)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const sx = cx + sp.x * scale + Math.sin(frame * 0.4 + i * 0.3) * 1.5;
      const sy = cy + sp.y * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // 茎上微弱粒子点
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const sx = cx + sp.x * scale + Math.sin(frame * 0.4 + i * 0.3) * 1.5;
      const sy = cy + sp.y * scale;
      const alpha = 0.15 + Math.sin(frame * 1.5 + i * 0.5) * 0.08;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0, 210, 106, 0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 - i * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    // === 3. 粒子（螺旋星系核心渲染） ===
    // 全部使用 lighter（加法混合），让重叠区域产生连续光晕
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 微分自转：内圈角速度更大
      const angularVel = baseRotation * (1.0 / (0.3 + p.r * 0.7));
      const currentTheta = p.armOffset + angularVel;

      // 转换极坐标为屏幕坐标
      const organicR = p.r * (1 + Math.sin(currentTheta * 3 + p.phase) * 0.03); // 微弱有机变形
      const px = cx + Math.cos(currentTheta) * organicR * scale;
      const py = cy + Math.sin(currentTheta) * organicR * scale * 0.82; // y轴压扁，形成椭圆星系

      // 粒子漂移（微弱的径向呼吸）
      const drift = Math.sin(frame * p.pulseSpeed + p.driftPhase) * p.driftAmp * scale;
      const finalX = px + Math.cos(currentTheta) * drift;
      const finalY = py + Math.sin(currentTheta) * drift * 0.82;

      // 脉冲亮度
      const pulse = 0.65 + Math.sin(frame * p.pulseSpeed + p.phase) * 0.35;

      const [r, g, b] = NODE_COLOR[p.kind];

      if (p.isCore) {
        // 核心粒子：白热光晕 + 大 sprite
        const spriteSize = p.size * 14 * pulse;
        ctx.globalAlpha = Math.min(0.9, (0.5 + p.activation * 0.3) * pulse);
        ctx.drawImage(coreSprite, finalX - spriteSize / 2, finalY - spriteSize / 2, spriteSize, spriteSize);

        // 核心纯白点
        ctx.globalAlpha = Math.min(1, pulse * 0.9);
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
        ctx.beginPath();
        ctx.arc(finalX, finalY, Math.max(0.8, p.size * 0.8), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 普通粒子：彩色光晕
        const brightness = Math.max(0.5, 1 - p.r * 0.4); // 外围粒子稍暗
        const spriteSize = p.size * 8 * pulse * brightness;
        const alpha = (0.35 + p.activation * 0.35) * pulse * brightness;

        ctx.globalAlpha = Math.min(0.85, alpha);
        ctx.drawImage(particleSprite, finalX - spriteSize / 2, finalY - spriteSize / 2, spriteSize, spriteSize);

        // 粒子核心点（彩色）
        ctx.globalAlpha = Math.min(1, alpha * 1.8);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(finalX, finalY, Math.max(0.6, p.size * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // === 4. 中心胞体核心光晕 ===
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.15);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    coreGrad.addColorStop(0.2, 'rgba(0, 210, 106, 0.18)');
    coreGrad.addColorStop(0.6, 'rgba(0, 180, 90, 0.06)');
    coreGrad.addColorStop(1, 'rgba(0, 140, 70, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, scale * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, [state, particleSprite, coreSprite, nebulaGlowSprite]);

  useEffect(() => {
    let running = true;
    let lastFrame = 0;
    // 节流到 ~30fps
    const frameInterval = 1000 / 30;
    const loop = (now: number) => {
      if (!running) return;
      if (!reducedMotion && now - lastFrame >= frameInterval) {
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
  }, [draw, reducedMotion]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const handlePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height * 0.44;
    const scale = Math.min(rect.width, rect.height) * 0.78;

    // 找到最近的粒子
    const { particles } = galaxyRef.current;
    let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;
    const frame = performance.now() / 1000;
    const baseRotation = frame * 0.04;

    for (const p of particles) {
      const angularVel = baseRotation * (1.0 / (0.3 + p.r * 0.7));
      const currentTheta = p.armOffset + angularVel;
      const organicR = p.r * (1 + Math.sin(currentTheta * 3 + p.phase) * 0.03);
      const px = cx + Math.cos(currentTheta) * organicR * scale;
      const py = cy + Math.sin(currentTheta) * organicR * scale * 0.82;
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
  }, []);

  const handleClick = useCallback(() => {
    // 点击时触发脉冲效果（未来可扩展）
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
      onPointerMove={handlePointer}
      onPointerLeave={() => setHoverInfo(null)}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hoverInfo && (
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
    </div>
  );
}

export default LifeCoreCanvas;
