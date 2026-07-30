'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 粒子神经生命云
 * ─────────────────────────────────────────────────────────────
 * 主体是「粒子」：每颗粒子是一团叠加发光的光雾，而不是实心小圆点。
 * 突触连线只作为极弱的辅助层，绝不抢过粒子的视觉权重。
 *
 * 节点绑定四类真实数据：
 * - memory    长期记忆   记忆金
 * - event     家庭事件   生命紫
 * - knowledge 知识文档   灰蓝
 * - agent     Agent 活动 时墨绿
 *
 * 交互：
 * - 指针移动 → 整个生命云视差转动，粒子被轻微推开
 * - 指针悬停 → 最近的粒子放大点亮，浮出它代表的数据类别
 * - 点击     → 从落点扩散一圈激活涟漪
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
  bx: number;
  by: number;
  bz: number;
  radius: number;
  phase: number;
  drift: number;
  /** 激活强度 0-1 */
  activation: number;
  /** 出生进度 0-1 */
  birth: number;
  size: number;
}

/** 节点配色，对应设计令牌色值 */
const NODE_COLOR: Record<NodeKind, [number, number, number]> = {
  memory: [245, 200, 91],
  event: [167, 139, 250],
  knowledge: [150, 178, 205],
  agent: [0, 229, 168],
};

const KIND_LABEL: Record<NodeKind, string> = {
  memory: '长期记忆',
  event: '家庭事件',
  knowledge: '知识文档',
  agent: 'Agent 活动',
};

/** 单类节点的粒子上限 */
const KIND_CAP: Record<NodeKind, number> = {
  memory: 150,
  event: 70,
  knowledge: 110,
  agent: 50,
};

/** 把真实业务数量压缩成视觉粒子数，用对数避免线性爆炸 */
function scaleCount(raw: number, cap: number): number {
  if (raw <= 0) return 0;
  const scaled = Math.round(Math.log2(raw + 1) * 16);
  return Math.max(4, Math.min(cap, scaled));
}

function buildNodes(counts: LifeCoreCounts, level: number): Node[] {
  const nodes: Node[] = [];
  const spread = 0.8 + Math.min(level, 20) * 0.008;

  (Object.keys(NODE_COLOR) as NodeKind[]).forEach((kind) => {
    const total = scaleCount(counts[kind] ?? 0, KIND_CAP[kind]);
    for (let i = 0; i < total; i++) {
      // 黄金角球面分布，保证均匀不结块
      const t = (i + 0.5) / total;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;

      // agent 更靠核心，knowledge 更靠外层，形成层次
      const depthBias =
        kind === 'agent' ? 0.42 : kind === 'memory' ? 0.68 : kind === 'event' ? 0.84 : 1;
      const radius = (0.3 + Math.pow(t, 0.55) * 0.7) * depthBias * spread;

      nodes.push({
        kind,
        bx: Math.sin(inclination) * Math.cos(azimuth) * radius,
        by: Math.cos(inclination) * radius * 0.76,
        bz: Math.sin(inclination) * Math.sin(azimuth) * radius,
        radius,
        phase: Math.random() * Math.PI * 2,
        drift: 0.35 + Math.random() * 0.65,
        activation: 0,
        birth: 1,
        size: kind === 'agent' ? 2.6 : kind === 'memory' ? 2.1 : 1.7,
      });
    }
  });

  return nodes;
}

/**
 * 预渲染一颗发光粒子精灵。
 * 用离屏 canvas 缓存径向渐变，避免每帧为上百颗粒子重建渐变对象。
 */
function makeSprite(rgb: [number, number, number]): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const [r, gr, b] = rgb;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 1)`);
    grad.addColorStop(0.18, `rgba(${r}, ${gr}, ${b}, 0.85)`);
    grad.addColorStop(0.42, `rgba(${r}, ${gr}, ${b}, 0.3)`);
    grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

export default function LifeCoreCanvas({
  state = 'companion',
  counts,
  level = 1,
  className,
}: LifeCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  /** 悬停命中的粒子类别，用于浮出标签 */
  const [hovered, setHovered] = useState<{ kind: NodeKind; x: number; y: number } | null>(null);

  // counts / level 变化时重建节点，让"学习"真实反映数据增长
  const seed = useMemo(
    () => buildNodes(counts, level),
    [counts.memory, counts.event, counts.knowledge, counts.agent, level],
  );

  const stateRef = useRef<LifeCoreState>(state);
  stateRef.current = state;

  /** 指针状态：归一化到 -1~1，null 表示指针不在画布内 */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** 点击涟漪队列 */
  const ripples = useRef<{ x: number; y: number; age: number }[]>([]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointer.current = null;
    setHovered(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    ripples.current.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      age: 0,
    });
    if (ripples.current.length > 4) ripples.current.shift();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = seed.map((n) => ({ ...n }));

    // 学习状态下，新节点从核心生长出来
    if (stateRef.current === 'learning') {
      nodes.slice(-8).forEach((n) => {
        n.birth = 0;
      });
    }

    // 预渲染四类粒子精灵
    const sprites = {
      memory: makeSprite(NODE_COLOR.memory),
      event: makeSprite(NODE_COLOR.event),
      knowledge: makeSprite(NODE_COLOR.knowledge),
      agent: makeSprite(NODE_COLOR.agent),
    } as Record<NodeKind, HTMLCanvasElement>;

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
    let recallCursor = 0;
    /** 视差角度，向指针位置缓动 */
    let tiltX = 0;
    let tiltY = 0;
    /** 悬停命中节流 */
    let hoverTick = 0;

    const projected: {
      x: number;
      y: number;
      depth: number;
      alpha: number;
      n: Node;
    }[] = [];

    const render = () => {
      const currentState = stateRef.current;
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.42;

      // 陪伴：核心区域呼吸（约 4 秒一次，接近人的静息呼吸）
      const breath = Math.sin((frame / 240) * Math.PI * 2);
      const breathScale = currentState === 'companion' ? 1 + breath * 0.045 : 1;
      const growPulse =
        currentState === 'growing' ? 1 + Math.sin((frame / 150) * Math.PI * 2) * 0.09 : 1;

      const scale = baseScale * breathScale * growPulse;
      const spin = frame * 0.0016;

      // 指针视差：缓动到目标倾角，松手后回正
      const p = pointer.current;
      const targetX = p ? ((p.x - cx) / (width || 1)) * 0.9 : 0;
      const targetY = p ? ((p.y - cy) / (height || 1)) * 0.9 : 0;
      tiltX += (targetX - tiltX) * 0.06;
      tiltY += (targetY - tiltY) * 0.06;

      ctx.clearRect(0, 0, width, height);

      // ── 核心光晕：生命体的心脏 ──
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseScale * 0.9);
      const coreAlpha = 0.15 + (currentState === 'companion' ? breath * 0.05 : 0.02);
      coreGlow.addColorStop(0, `rgba(0, 229, 168, ${Math.max(0.05, coreAlpha).toFixed(3)})`);
      coreGlow.addColorStop(0.45, 'rgba(0, 229, 168, 0.04)');
      coreGlow.addColorStop(1, 'rgba(0, 229, 168, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, baseScale * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // ── 回忆：逐个点亮节点 ──
      if (currentState === 'recalling' && frame % 8 === 0 && nodes.length > 0) {
        recallCursor = (recallCursor + 1) % nodes.length;
        nodes[recallCursor].activation = 1;
      }

      // ── 涟漪推进：命中范围内的粒子被激活 ──
      for (const rp of ripples.current) {
        rp.age += 1;
      }
      ripples.current = ripples.current.filter((rp) => rp.age < 90);

      projected.length = 0;

      for (const n of nodes) {
        if (n.birth < 1) n.birth = Math.min(1, n.birth + 0.012);
        if (n.activation > 0) n.activation = Math.max(0, n.activation - 0.011);

        // 流动：绕 Y 轴自转 + 轻微漂移
        const angle = spin * n.drift + n.phase;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let x = n.bx * cos - n.bz * sin;
        let z = n.bx * sin + n.bz * cos;
        let y = n.by + Math.sin(frame * 0.008 + n.phase) * 0.03;

        // 指针视差：绕 Y / X 轴额外倾斜整个云
        const ty = tiltX * 0.8;
        const cy2 = Math.cos(ty);
        const sy2 = Math.sin(ty);
        const x2 = x * cy2 - z * sy2;
        z = x * sy2 + z * cy2;
        x = x2;

        const tx = -tiltY * 0.6;
        const cx2 = Math.cos(tx);
        const sx2 = Math.sin(tx);
        const y2 = y * cx2 - z * sx2;
        z = y * sx2 + z * cx2;
        y = y2;

        const perspective = 1 / (1.9 - z * 0.55);
        const birthEase = n.birth * n.birth * (3 - 2 * n.birth);

        let sx = cx + x * scale * perspective;
        let sy = cy + y * scale * perspective;

        // 指针斥力：靠近指针的粒子被轻轻推开，产生"活的"触感
        if (p) {
          const dx = sx - p.x;
          const dy = sy - p.y;
          const d2 = dx * dx + dy * dy;
          const reach = baseScale * 0.42;
          if (d2 < reach * reach && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / reach) * 16;
            sx += (dx / d) * push;
            sy += (dy / d) * push;
          }
        }

        // 涟漪激活：波前扫过的粒子亮起
        for (const rp of ripples.current) {
          const front = (rp.age / 90) * baseScale * 1.6;
          const d = Math.hypot(sx - rp.x, sy - rp.y);
          if (Math.abs(d - front) < baseScale * 0.1) {
            n.activation = Math.max(n.activation, 1 - rp.age / 90);
          }
        }

        projected.push({
          x: sx,
          y: sy,
          depth: perspective,
          alpha: (0.3 + perspective * 0.45) * birthEase,
          n,
        });
      }

      // ── 突触连线：仅作极弱辅助层 ──
      // 半径与透明度都大幅收紧，确保视觉主体是粒子而不是线。
      ctx.lineWidth = 0.5;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        for (let j = i + 1; j < Math.min(i + 4, projected.length); j++) {
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = baseScale * 0.16;
          if (dist > maxDist) continue;

          const closeness = 1 - dist / maxDist;
          const lit = Math.max(a.n.activation, b.n.activation);
          const alpha = closeness * 0.05 + lit * 0.16;
          if (alpha <= 0.015) continue;

          ctx.strokeStyle =
            lit > 0.1
              ? `rgba(245, 200, 91, ${alpha.toFixed(3)})`
              : `rgba(150, 178, 205, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // ── 粒子绘制：叠加发光精灵，远的先画 ──
      projected.sort((q, r) => q.depth - r.depth);
      ctx.globalCompositeOperation = 'lighter';

      let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;

      for (const q of projected) {
        const lit = q.n.activation;
        const glow = q.n.size * q.depth * (5.4 + lit * 4.2);
        const alpha = Math.min(1, q.alpha * 0.85 + lit * 0.5);

        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[q.n.kind], q.x - glow, q.y - glow, glow * 2, glow * 2);

        // 记录距指针最近的粒子
        if (p) {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 26 && (!best || d < best.d)) {
            best = { kind: q.n.kind, x: q.x, y: q.y, d };
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // 悬停标签：节流更新，避免每帧 setState
      hoverTick++;
      if (hoverTick % 6 === 0) {
        if (best) {
          setHovered((prev) =>
            prev && prev.kind === best!.kind && Math.abs(prev.x - best!.x) < 6
              ? prev
              : { kind: best!.kind, x: best!.x, y: best!.y },
          );
        } else if (p === null) {
          setHovered(null);
        } else {
          setHovered((prev) => (prev ? null : prev));
        }
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
    <div className={className} data-life-core>
      <canvas
        ref={canvasRef}
        className="life-core__canvas"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        role="img"
        aria-label={`SuiYan 生命核心：${counts.memory} 条记忆、${counts.event} 个家庭事件、${counts.knowledge} 份知识、${counts.agent} 个活跃 Agent`}
      />
      {hovered ? (
        <span
          className="life-core__tag"
          style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
          aria-hidden="true"
        >
          {KIND_LABEL[hovered.kind]}
        </span>
      ) : null}
    </div>
  );
}
