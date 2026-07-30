'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 粒子星云神经元 V4
 * ─────────────────────────────────────────────────────────────
 * 概念：粒子星云神经元。
 * - 中心是一团柔和的星云光晕（胞体），不是亮白团
 * - 数百个微小发光粒子散布在星云中，密度从中心向外递减
 * - 粒子之间通过极细的微弱连线相连（神经网络）
 * - 底部一条纤细的轴突茎向下延伸
 * - 粒子有微弱的脉冲呼吸和缓慢漂移
 * - 信号脉冲偶尔沿连线传播
 * - 整体呈现深邃、有机、宇宙星云般的生命感
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

// 粒子颜色
const NODE_COLOR: Record<NodeKind, [number, number, number]> = {
  agent: [0, 229, 168],      // 时墨绿（主色，最多）
  memory: [245, 200, 91],    // 记忆金
  event: [167, 139, 250],    // 生命紫
  knowledge: [122, 184, 240], // 天空蓝
};

interface Particle {
  kind: NodeKind;
  // 归一化坐标（相对于星云中心，0~1尺度）
  nx: number;
  ny: number;
  // 基础大小系数
  size: number;
  // 相位（用于脉冲动画）
  phase: number;
  // 脉冲速度
  pulseSpeed: number;
  // 漂移速度
  driftAmp: number;
  driftPhaseX: number;
  driftPhaseY: number;
  // 激活度 0~1
  activation: number;
  // 距中心距离（用于密度衰减）
  dist: number;
  // 连线邻居索引
  neighbors: number[];
}

interface Connection {
  a: number;
  b: number;
  // 连线强度
  strength: number;
}

interface SignalPulse {
  connectionIndex: number;
  // 0~1 沿连线的位置
  t: number;
  speed: number;
  color: [number, number, number];
  life: number;
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

function buildNebula(counts: LifeCoreCounts, level: number): {
  particles: Particle[];
  connections: Connection[];
  stemPoints: { x: number; y: number }[];
} {
  const rand = mulberry32(42 + level * 7);
  // 粒子上限从 420 降至 220 — 视觉效果几乎无损，GPU 负担减半
  const total = Math.min(220, 100 + (counts.memory + counts.event + counts.knowledge + counts.agent) * 4 + level * 6);

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

  // 生成粒子：大面积散布的星云，不是集中的一团
  // 使用极坐标 + 有机变形，创建宽广的星云形状
  for (let i = 0; i < total; i++) {
    // 距中心距离：使用线性分布让粒子均匀散布，不是全挤在中心
    const r = Math.pow(rand(), 0.45);
    // 角度
    const angle = rand() * Math.PI * 2;
    // 有机变形：多个谐波让形状不规则，像真实星云
    const organicR = r * (
      0.85 +
      Math.sin(angle * 2 + rand() * 0.5) * 0.12 +
      Math.sin(angle * 3 + rand() * 0.3) * 0.08 +
      Math.sin(angle * 5 + rand() * 0.7) * 0.06 +
      rand() * 0.08
    );

    // 转换为归一化坐标 — 大范围散布
    const nx = Math.cos(angle) * organicR * 0.62;
    const ny = Math.sin(angle) * organicR * 0.52 - 0.05;

    // 粒子大小：更均匀，中心略大但不悬殊
    const coreFactor = Math.max(0.4, 1 - r * 0.5);
    const size = 0.8 + coreFactor * 0.8 + rand() * 0.4;

    particles.push({
      kind: kindPool[i] || 'agent',
      nx,
      ny,
      size,
      phase: rand() * Math.PI * 2,
      pulseSpeed: 0.3 + rand() * 0.5,
      driftAmp: 0.003 + rand() * 0.005,
      driftPhaseX: rand() * Math.PI * 2,
      driftPhaseY: rand() * Math.PI * 2,
      activation: 0.3 + rand() * 0.3,
      dist: organicR,
      neighbors: [],
    });
  }

  // 生成连线：连接距离较近的粒子
  const connections: Connection[] = [];
  const connectionDist = 0.12; // 归一化距离阈值（从 0.14 降低，减少连线数量）
  const maxConnectionsPerParticle = 3;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const near: { idx: number; dist: number }[] = [];
    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j];
      const dx = p.nx - q.nx;
      const dy = p.ny - q.ny;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < connectionDist) {
        near.push({ idx: j, dist: d });
      }
    }
    near.sort((a, b) => a.dist - b.dist);
    const maxConn = Math.min(maxConnectionsPerParticle, near.length);
    for (let k = 0; k < maxConn; k++) {
      const j = near[k].idx;
      if (particles[j].neighbors.length >= maxConnectionsPerParticle) continue;
      const strength = 1 - near[k].dist / connectionDist;
      p.neighbors.push(j);
      particles[j].neighbors.push(i);
      connections.push({ a: i, b: j, strength: strength * strength });
    }
  }

  // 轴突茎：从星云底部向下延伸的一串点
  const stemPoints: { x: number; y: number }[] = [];
  const stemSegments = 12;
  for (let i = 0; i <= stemSegments; i++) {
    const t = i / stemSegments;
    const curveX = Math.sin(t * 1.2) * 0.02 * (1 - t * 0.5);
    stemPoints.push({
      x: curveX,
      y: 0.20 + t * 0.50,
    });
  }

  return { particles, connections, stemPoints };
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

  const nebula = useMemo(() => buildNebula(counts, level), [counts, level]);
  const nebulaRef = useRef(nebula);
  nebulaRef.current = nebula;

  const pulsesRef = useRef<SignalPulse[]>([]);
  const lastPulseRef = useRef(0);

  // 预渲染粒子sprite
  const [particleSprite, setParticleSprite] = useState<HTMLCanvasElement | null>(null);
  const [nebulaGlowSprite, setNebulaGlowSprite] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 创建粒子光晕sprite
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    setParticleSprite(canvas);

    // 创建星云背景光晕sprite（大而柔和）
    const glowSize = 256;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize;
    glowCanvas.height = glowSize;
    const gctx = glowCanvas.getContext('2d')!;
    // 多层柔和光晕，不是亮白而是时墨绿
    const glowGrad = gctx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
    glowGrad.addColorStop(0, 'rgba(0,229,168,0.18)');
    glowGrad.addColorStop(0.25, 'rgba(0,229,168,0.10)');
    glowGrad.addColorStop(0.5, 'rgba(0,180,140,0.05)');
    glowGrad.addColorStop(0.75, 'rgba(0,140,120,0.02)');
    glowGrad.addColorStop(1, 'rgba(0,100,100,0)');
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

    const { particles, connections, stemPoints } = nebulaRef.current;
    if (!particles.length || !particleSprite || !nebulaGlowSprite) return;

    const frame = performance.now() / 1000;
    const cx = width / 2;
    const cy = height * 0.45;
    const nebulaScale = Math.min(width, height) * 0.72;

    // 星云整体呼吸
    const breath = state === 'companion'
      ? 0.95 + Math.sin(frame * 0.8) * 0.05
      : state === 'learning'
      ? 1.0 + Math.sin(frame * 1.5) * 0.08
      : state === 'recalling'
      ? 0.92 + Math.sin(frame * 2.0) * 0.10
      : 1.05 + Math.sin(frame * 0.6) * 0.06;

    const scale = nebulaScale * breath;

    // 1. 星云背景光晕（大而柔和，范围广，不是亮白）
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4;
    const glowW = nebulaScale * 2.0;
    const glowH = nebulaScale * 1.7;
    ctx.drawImage(nebulaGlowSprite, cx - glowW / 2, cy - glowH / 2, glowW, glowH);

    // 2. 轴突茎（从星云底部向下延伸）
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(0, 200, 150, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const sx = cx + sp.x * scale + Math.sin(frame * 0.5 + i * 0.3) * 2;
      const sy = cy + sp.y * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // 茎上的粒子点
    for (let i = 1; i < stemPoints.length; i++) {
      const sp = stemPoints[i];
      const sx = cx + sp.x * scale + Math.sin(frame * 0.5 + i * 0.3) * 2;
      const sy = cy + sp.y * scale;
      const alpha = 0.2 + Math.sin(frame * 2 + i * 0.5) * 0.1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0, 229, 168, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 - i * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 神经连线（极细极微弱）
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const conn of connections) {
      const p = particles[conn.a];
      const q = particles[conn.b];
      if (!p || !q) continue;

      const px = cx + p.nx * scale;
      const py = cy + p.ny * scale;
      const qx = cx + q.nx * scale;
      const qy = cy + q.ny * scale;

      // 连线透明度随距离衰减，且有微弱脉冲
      const distFade = conn.strength * 0.12;
      const pulse = 0.5 + Math.sin(frame * 1.5 + p.phase + q.phase) * 0.3;
      const alpha = distFade * pulse;

      if (alpha < 0.005) continue;

      ctx.strokeStyle = `rgba(100, 200, 180, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(qx, qy);
      ctx.stroke();
    }

    // 4. 信号脉冲（沿连线传播的微光）
    const pulses = pulsesRef.current;
    // 定期发射新脉冲
    if (frame - lastPulseRef.current > (state === 'companion' ? 2.5 : state === 'learning' ? 0.8 : 1.5)) {
      lastPulseRef.current = frame;
      if (pulses.length < 8) {
        const ci = Math.floor(Math.random() * connections.length);
        const conn = connections[ci];
        if (conn) {
          const kind = particles[conn.a]?.kind || 'agent';
          pulses.push({
            connectionIndex: ci,
            t: 0,
            speed: 0.3 + Math.random() * 0.3,
            color: NODE_COLOR[kind],
            life: 1,
          });
        }
      }
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      pulse.t += pulse.speed * 0.016;
      pulse.life = 1 - pulse.t;
      if (pulse.t >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const conn = connections[pulse.connectionIndex];
      if (!conn) { pulses.splice(i, 1); continue; }
      const p = particles[conn.a];
      const q = particles[conn.b];
      if (!p || !q) { pulses.splice(i, 1); continue; }

      const px = cx + p.nx * scale;
      const py = cy + p.ny * scale;
      const qx = cx + q.nx * scale;
      const qy = cy + q.ny * scale;
      const sx = px + (qx - px) * pulse.t;
      const sy = py + (qy - py) * pulse.t;

      const [r, g, b] = pulse.color;
      ctx.globalAlpha = pulse.life * 0.5;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pulse.life * 0.8})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. 粒子（微小发光点）
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      // 粒子漂移
      const dx = Math.sin(frame * p.pulseSpeed * 0.3 + p.driftPhaseX) * p.driftAmp * scale;
      const dy = Math.cos(frame * p.pulseSpeed * 0.3 + p.driftPhaseY) * p.driftAmp * scale;
      const px = cx + p.nx * scale + dx;
      const py = cy + p.ny * scale + dy;

      // 脉冲
      const pulse = 0.6 + Math.sin(frame * p.pulseSpeed + p.phase) * 0.4;
      const [r, g, b] = NODE_COLOR[p.kind];

      // 外围粒子保持亮度，不再急剧衰减
      const coreFactor = Math.max(0.5, 1 - p.dist * 0.35);
      const size = p.size * (1.8 + pulse * 0.6) * coreFactor;
      const alpha = (0.4 + p.activation * 0.4) * pulse * coreFactor;

      ctx.globalAlpha = Math.min(1, alpha);

      // 绘制粒子光晕（sprite 尺寸从 7x 降至 5x 减少 GPU overdraw）
      const spriteSize = size * 5;
      ctx.drawImage(
        particleSprite,
        px - spriteSize / 2,
        py - spriteSize / 2,
        spriteSize,
        spriteSize,
      );

      // 粒子核心（纯色小点）
      ctx.globalAlpha = Math.min(1, alpha * 1.5);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, size * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. 中心胞体核心（微弱的亮心，不是亮白团）
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.12);
    coreGrad.addColorStop(0, 'rgba(0, 229, 168, 0.20)');
    coreGrad.addColorStop(0.5, 'rgba(0, 180, 140, 0.08)');
    coreGrad.addColorStop(1, 'rgba(0, 140, 120, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, scale * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, [state, particleSprite, nebulaGlowSprite]);

  useEffect(() => {
    let running = true;
    let lastFrame = 0;
    // 节流到 ~30fps，减少 GPU 绘制调用一半
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
    const cy = rect.height * 0.45;
    const scale = Math.min(rect.width, rect.height) * 0.72;

    // 找到最近的粒子
    const { particles } = nebulaRef.current;
    let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;
    for (const p of particles) {
      const px = cx + p.nx * scale;
      const py = cy + p.ny * scale;
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
    // 点击时从中心发射一个脉冲波
    const { connections, particles } = nebulaRef.current;
    for (let k = 0; k < 5; k++) {
      const ci = Math.floor(Math.random() * connections.length);
      const conn = connections[ci];
      if (conn) {
        pulsesRef.current.push({
          connectionIndex: ci,
          t: 0,
          speed: 0.5 + Math.random() * 0.3,
          color: NODE_COLOR[particles[conn.a]?.kind || 'agent'],
          life: 1,
        });
      }
    }
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
