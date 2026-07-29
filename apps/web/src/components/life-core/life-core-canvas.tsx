'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 粒子神经生命云
 * ─────────────────────────────────────────────────────────────
 * 不是背景效果，而是产品的核心生命体。
 *
 * 节点绑定四类真实数据：
 * - memory    长期记忆        记忆金 #F5C85B
 * - event     家庭事件        生命紫 #A78BFA
 * - knowledge 知识文档        灰蓝
 * - agent     Agent 活动      时墨绿 #00E5A8
 *
 * 状态语义：
 * - learning   学习中 → 新增节点从核心生长出来
 * - recalling  回忆中 → 已有节点被逐个点亮激活
 * - companion  陪伴中 → 核心区域缓慢呼吸
 * - growing    成长中 → 整个网络向外扩散
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
  /** 当前生命状态，驱动粒子行为 */
  state?: LifeCoreState;
  /** 四类节点的真实数量，决定粒子构成 */
  counts: LifeCoreCounts;
  /** 生命等级，影响网络半径与密度 */
  level?: number;
  className?: string;
}

/** 单个粒子节点 */
interface Node {
  kind: NodeKind;
  /** 球面基准坐标 */
  bx: number;
  by: number;
  bz: number;
  /** 归一化半径 0-1，核心近、外围远 */
  radius: number;
  /** 自转相位偏移，让流动不同步 */
  phase: number;
  /** 漂移速度 */
  drift: number;
  /** 激活强度 0-1，回忆时被点亮 */
  activation: number;
  /** 出生进度 0-1，学习时新节点从 0 生长 */
  birth: number;
  size: number;
}

/** 节点配色，全部对应设计令牌色值 */
const NODE_COLOR: Record<NodeKind, [number, number, number]> = {
  memory: [245, 200, 91], // --color-highlight 记忆金
  event: [167, 139, 250], // --color-purple 生命紫
  knowledge: [140, 170, 200], // 灰蓝
  agent: [0, 229, 168], // --color-primary 时墨绿
};

/** 单类节点的粒子上限，避免大数值把画面塞满 */
const KIND_CAP: Record<NodeKind, number> = {
  memory: 90,
  event: 40,
  knowledge: 60,
  agent: 30,
};

/** 把真实业务数量压缩成视觉粒子数，用对数避免线性爆炸 */
function scaleCount(raw: number, cap: number): number {
  if (raw <= 0) return 0;
  const scaled = Math.round(Math.log2(raw + 1) * 12);
  return Math.max(3, Math.min(cap, scaled));
}

function buildNodes(counts: LifeCoreCounts, level: number): Node[] {
  const nodes: Node[] = [];
  const spread = 0.82 + Math.min(level, 20) * 0.009;

  (Object.keys(NODE_COLOR) as NodeKind[]).forEach((kind) => {
    const total = scaleCount(counts[kind] ?? 0, KIND_CAP[kind]);
    for (let i = 0; i < total; i++) {
      // 黄金角球面分布，保证均匀不结块
      const t = (i + 0.5) / total;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;

      // agent 更靠核心，knowledge 更靠外层，形成层次
      const depthBias =
        kind === 'agent' ? 0.45 : kind === 'memory' ? 0.7 : kind === 'event' ? 0.85 : 1;
      const radius = (0.32 + Math.pow(t, 0.55) * 0.68) * depthBias * spread;

      nodes.push({
        kind,
        bx: Math.sin(inclination) * Math.cos(azimuth) * radius,
        by: Math.cos(inclination) * radius * 0.78,
        bz: Math.sin(inclination) * Math.sin(azimuth) * radius,
        radius,
        phase: Math.random() * Math.PI * 2,
        drift: 0.35 + Math.random() * 0.65,
        activation: 0,
        birth: 1,
        size: kind === 'agent' ? 2.1 : kind === 'memory' ? 1.7 : 1.4,
      });
    }
  });

  return nodes;
}

export default function LifeCoreCanvas({
  state = 'companion',
  counts,
  level = 1,
  className,
}: LifeCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  // counts / level 变化时重建节点，让"学习"真实反映数据增长
  const seed = useMemo(
    () => buildNodes(counts, level),
    [counts.memory, counts.event, counts.knowledge, counts.agent, level],
  );

  const stateRef = useRef<LifeCoreState>(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = seed.map((n) => ({ ...n }));

    // 学习状态下，新节点从核心生长出来
    if (stateRef.current === 'learning') {
      nodes.slice(-6).forEach((n) => {
        n.birth = 0;
      });
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let frame = 0;
    /** 回忆时轮播激活的游标 */
    let recallCursor = 0;

    /** 投影后的屏幕坐标缓存，供连线复用 */
    const projected: { x: number; y: number; depth: number; alpha: number; n: Node }[] = [];

    const render = () => {
      const currentState = stateRef.current;
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.42;

      // 陪伴：核心区域呼吸（4 秒一次，与人的静息呼吸接近）
      const breath = Math.sin((frame / 240) * Math.PI * 2);
      const breathScale = currentState === 'companion' ? 1 + breath * 0.045 : 1;

      // 成长：网络整体向外扩散
      const growPulse = currentState === 'growing' ? 1 + Math.sin((frame / 150) * Math.PI * 2) * 0.09 : 1;

      const scale = baseScale * breathScale * growPulse;
      const spin = frame * 0.0016;

      ctx.clearRect(0, 0, width, height);

      // ── 核心光晕：生命体的心脏 ──
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseScale * 0.85);
      const coreAlpha = 0.16 + (currentState === 'companion' ? breath * 0.05 : 0.02);
      coreGlow.addColorStop(0, `rgba(0, 229, 168, ${Math.max(0.06, coreAlpha)})`);
      coreGlow.addColorStop(0.45, 'rgba(0, 229, 168, 0.05)');
      coreGlow.addColorStop(1, 'rgba(0, 229, 168, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, baseScale * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // ── 回忆：逐个点亮节点 ──
      if (currentState === 'recalling' && frame % 8 === 0 && nodes.length > 0) {
        recallCursor = (recallCursor + 1) % nodes.length;
        nodes[recallCursor].activation = 1;
      }

      projected.length = 0;

      // ── 节点投影 ──
      for (const n of nodes) {
        // 出生动画：新节点从核心浮现
        if (n.birth < 1) {
          n.birth = Math.min(1, n.birth + 0.012);
        }
        // 激活衰减
        if (n.activation > 0) {
          n.activation = Math.max(0, n.activation - 0.012);
        }

        // 流动：每个节点绕 Y 轴自转 + 轻微上下漂移
        const angle = spin * n.drift + n.phase;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = n.bx * cos - n.bz * sin;
        const z = n.bx * sin + n.bz * cos;
        const y = n.by + Math.sin(frame * 0.008 + n.phase) * 0.03;

        // 透视投影：z 越近越大越亮
        const perspective = 1 / (1.9 - z * 0.55);
        const birthEase = n.birth * n.birth * (3 - 2 * n.birth);

        projected.push({
          x: cx + x * scale * perspective,
          y: cy + y * scale * perspective,
          depth: perspective,
          alpha: (0.28 + perspective * 0.42) * birthEase,
          n,
        });
      }

      // ── 连接：近邻之间生成神经突触 ──
      ctx.lineWidth = 0.6;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        // 只与后续少量节点比较，把复杂度控制在线性附近
        for (let j = i + 1; j < Math.min(i + 9, projected.length); j++) {
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = baseScale * 0.34;
          if (dist > maxDist) continue;

          const closeness = 1 - dist / maxDist;
          const lit = Math.max(a.n.activation, b.n.activation);
          const alpha = closeness * 0.1 * Math.min(a.alpha, b.alpha) * 3 + lit * 0.24;
          if (alpha <= 0.012) continue;

          ctx.strokeStyle = lit > 0.1
            ? `rgba(245, 200, 91, ${alpha.toFixed(3)})`
            : `rgba(150, 180, 205, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // ── 节点绘制：远的先画，近的覆盖上去 ──
      projected.sort((p, q) => p.depth - q.depth);
      for (const p of projected) {
        const [r, g, b] = NODE_COLOR[p.n.kind];
        const lit = p.n.activation;
        const size = p.n.size * p.depth * (1 + lit * 0.9);
        const alpha = Math.min(1, p.alpha + lit * 0.5);

        if (lit > 0.05) {
          // 激活节点带一圈柔光
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 5);
          halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(lit * 0.3).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      frame++;
      raf = requestAnimationFrame(render);
    };

    if (reduceMotion) {
      // 减弱动效：只渲染一帧静态网络
      render();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [seed, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
