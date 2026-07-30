'use client';

/**
 * NeuralTreeCanvas —— 生命树粒子云神经元可视化
 * ─────────────────────────────────────────────────────────────
 * 把传统的树形列表转成「粒子云神经元」：每个生命树节点是一团叠加发光的
 * 光雾粒子。根节点居于中心并更大，子节点围绕父节点缓慢公转，父子之间用
 * 极弱的发光线相连。视觉主体始终是粒子，连线只作辅助层。
 *
 * 节点类型配色（与设计令牌一致）：
 * - ROOT      根节点   apple-blue   #0071e3
 * - CATEGORY  分类     apple-gray   #86868b
 * - EVENT     事件     apple-amber  #ff9f0a
 * - PERSON    人物     apple-green  #30d158
 * - PLACE     地点     indigo       #7a78e6
 * - THEME     主题     apple-purple #af52de
 *
 * 交互：
 * - 指针移动 → 整个神经元云视差漂移，最近的粒子点亮并浮出标题标签
 * - 点击粒子 → 选中该节点（调用 onSelect）
 * - 选中粒子 → 持续脉动的光环
 *
 * 技术要点：
 * - 预渲染发光精灵（离屏 canvas 缓存径向渐变），避免每帧重建渐变
 * - requestAnimationFrame 驱动动画，ResizeObserver 响应式尺寸
 * - 卸载时清理动画帧与事件监听
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { LifeTreeNodeType, type LifeTreeNode } from '@echolife/shared';
import { lifeTreeNodeTypeLabels } from '@/lib/labels';
import { cn } from '@/lib/utils';

type RGB = [number, number, number];

/** 节点类型配色，对应设计令牌色值（RGB 分量） */
const TYPE_COLOR: Record<string, RGB> = {
  [LifeTreeNodeType.ROOT]: [0, 113, 227], // apple-blue #0071e3
  [LifeTreeNodeType.CATEGORY]: [134, 134, 139], // apple-gray #86868b
  [LifeTreeNodeType.EVENT]: [255, 159, 10], // apple-amber #ff9f0a
  [LifeTreeNodeType.PERSON]: [48, 209, 88], // apple-green #30d158
  [LifeTreeNodeType.PLACE]: [122, 120, 230], // indigo #7a78e6
  [LifeTreeNodeType.THEME]: [175, 82, 222], // apple-purple #af52de
};

const DEFAULT_COLOR: RGB = TYPE_COLOR[LifeTreeNodeType.CATEGORY];

/** 图例展示顺序 */
const TYPE_ORDER = [
  LifeTreeNodeType.ROOT,
  LifeTreeNodeType.CATEGORY,
  LifeTreeNodeType.EVENT,
  LifeTreeNodeType.PERSON,
  LifeTreeNodeType.PLACE,
  LifeTreeNodeType.THEME,
];

/** 扁平化后的神经元节点 */
interface NeuralNode {
  id: string;
  title: string;
  type: string;
  /** 树深度，根节点为 0 */
  depth: number;
  /** 父节点在数组中的下标，根节点为 -1 */
  parentIndex: number;
  /** 相对父节点的轨道起始角 */
  orbitAngle: number;
  /** 相对父节点的轨道半径（归一化） */
  orbitRadius: number;
  /** 公转角速度（弧度/帧） */
  orbitSpeed: number;
  /** 闪烁/漂浮相位 */
  phase: number;
  /** 基础尺寸 */
  size: number;
  color: RGB;
}

interface Edge {
  parent: number;
  child: number;
}

interface BuiltTree {
  nodes: NeuralNode[];
  edges: Edge[];
}

/**
 * 把嵌套的 LifeTreeNode 树扁平化为带轨道参数的神经元节点。
 * 兄弟节点按角度均匀分布（加少量抖动），避免重叠结块。
 */
function buildNeuralNodes(roots: LifeTreeNode[]): BuiltTree {
  const nodes: NeuralNode[] = [];
  const edges: Edge[] = [];
  const rootCount = roots.length;

  function walk(node: LifeTreeNode, depth: number, parentIndex: number, angle: number) {
    const idx = nodes.length;
    const type = node.type ?? LifeTreeNodeType.CATEGORY;
    const color = TYPE_COLOR[type] ?? DEFAULT_COLOR;

    let orbitRadius: number;
    let orbitSpeed: number;
    if (parentIndex < 0) {
      // 根节点：多个则围绕中心排布，单个则居于正中
      orbitRadius = rootCount > 1 ? 0.38 : 0.05;
      orbitSpeed = 0.0012;
    } else {
      orbitRadius = 0.32 + depth * 0.06 + (Math.random() - 0.5) * 0.04;
      // 相邻层级反向公转，制造有机的神经元流动感
      const dir = depth % 2 === 0 ? 1 : -1;
      orbitSpeed = (0.0035 + Math.random() * 0.002) * dir;
    }

    nodes.push({
      id: node.id,
      title: node.title,
      type,
      depth,
      parentIndex,
      orbitAngle: angle,
      orbitRadius,
      orbitSpeed,
      phase: Math.random() * Math.PI * 2,
      size: depth === 0 ? 7.5 : Math.max(3.5, 5.5 - depth * 0.4),
      color,
    });

    if (parentIndex >= 0) {
      edges.push({ parent: parentIndex, child: idx });
    }

    const children = node.children ?? [];
    const count = children.length;
    children.forEach((child, i) => {
      const base = count > 1 ? (i / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 0.5;
      walk(child, depth + 1, idx, base + jitter);
    });
  }

  roots.forEach((root, i) => {
    const angle = rootCount > 1 ? (i / rootCount) * Math.PI * 2 : 0;
    walk(root, 0, -1, angle);
  });

  return { nodes, edges };
}

/**
 * 预渲染一颗发光粒子精灵。
 * 用离屏 canvas 缓存径向渐变，避免每帧为上百颗粒子重建渐变对象。
 */
function makeSprite(rgb: RGB): HTMLCanvasElement {
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

export interface NeuralTreeCanvasProps {
  /** 根节点数组（含嵌套 children） */
  nodes: LifeTreeNode[];
  /** 当前选中的节点 id */
  selectedId?: string | null;
  /** 点击粒子时的回调 */
  onSelect?: (id: string) => void;
  className?: string;
}

/** 命中半径（屏幕像素） */
const HIT_RADIUS = 30;

export default function NeuralTreeCanvas({
  nodes,
  selectedId = null,
  onSelect,
  className,
}: NeuralTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** 悬停命中的粒子，用于浮出标题标签 */
  const [hovered, setHovered] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
    color: RGB;
  } | null>(null);

  // 数据变化时重建节点布局
  const seed = useMemo(() => buildNeuralNodes(nodes), [nodes]);

  // 用 ref 读取最新的选中状态与回调，避免重启动画循环
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const onSelectRef = useRef<typeof onSelect>(onSelect);
  onSelectRef.current = onSelect;

  /** 指针位置（画布坐标），null 表示指针不在画布内 */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** 最近一帧的投影坐标，供点击命中使用 */
  const projectedRef = useRef<
    { id: string; title: string; x: number; y: number; depth: number; size: number; color: RGB; type: string }[]
  >([]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointer.current = null;
    setHovered(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const list = projectedRef.current;
    let best: { id: string; d: number } | null = null;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < HIT_RADIUS && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best && onSelectRef.current) onSelectRef.current(best.id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const nodesLocal = seed.nodes.map((n) => ({ ...n }));
    const edges = seed.edges;

    // 预渲染各类型粒子精灵
    const sprites = new Map<string, HTMLCanvasElement>();
    for (const n of nodesLocal) {
      if (!sprites.has(n.type)) sprites.set(n.type, makeSprite(n.color));
    }
    if (!sprites.has(LifeTreeNodeType.CATEGORY)) {
      sprites.set(LifeTreeNodeType.CATEGORY, makeSprite(DEFAULT_COLOR));
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let raf = 0;
    let frame = 0;
    /** 视差偏移，向指针位置缓动 */
    let parX = 0;
    let parY = 0;
    /** 悬停命中节流 */
    let hoverTick = 0;

    // 复用位置缓冲，避免每帧分配
    const positions: { x: number; y: number }[] = new Array(nodesLocal.length);

    const render = () => {
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.82;
      const t = frame;

      // 指针视差：缓动到目标偏移，松手后回正
      const p = pointer.current;
      const targetPX = p && !reduceMotion ? ((p.x - cx) / (width || 1)) * 2 - 1 : 0;
      const targetPY = p && !reduceMotion ? ((p.y - cy) / (height || 1)) * 2 - 1 : 0;
      parX += (targetPX - parX) * 0.05;
      parY += (targetPY - parY) * 0.05;
      const parAmt = baseScale * 0.12;

      ctx.clearRect(0, 0, width, height);

      // ── 中心光晕：神经元云的心脏 ──
      if (nodesLocal.length > 0) {
        const coreColor = nodesLocal.find((n) => n.depth === 0)?.color ?? DEFAULT_COLOR;
        const [cr, cg, cb] = coreColor;
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseScale * 0.9);
        coreGlow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.12)`);
        coreGlow.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.03)`);
        coreGlow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, baseScale * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 计算每个节点的归一化坐标与屏幕坐标 ──
      const projected: {
        id: string;
        title: string;
        x: number;
        y: number;
        depth: number;
        size: number;
        color: RGB;
        type: string;
      }[] = [];
      projectedRef.current = projected;

      for (let i = 0; i < nodesLocal.length; i++) {
        const n = nodesLocal[i];
        const a = n.orbitAngle + t * n.orbitSpeed;
        let px: number;
        let py: number;
        if (n.parentIndex < 0) {
          px = Math.cos(a) * n.orbitRadius;
          py = Math.sin(a) * n.orbitRadius;
        } else {
          const parent = positions[n.parentIndex];
          px = parent.x + Math.cos(a) * n.orbitRadius;
          py = parent.y + Math.sin(a) * n.orbitRadius;
        }
        // 轻微纵向漂浮，让云"呼吸"
        py += Math.sin(t * 0.02 + n.phase) * 0.012;
        positions[i] = { x: px, y: py };

        // 视差：越深的节点漂移越多，制造层次感
        const depthFactor = Math.min(1.4, 0.4 + n.depth * 0.2);
        const sx = cx + px * baseScale - parX * parAmt * depthFactor;
        const sy = cy + py * baseScale - parY * parAmt * depthFactor;

        projected.push({
          id: n.id,
          title: n.title,
          x: sx,
          y: sy,
          depth: n.depth,
          size: n.size,
          color: n.color,
          type: n.type,
        });
      }

      const selId = selectedIdRef.current;

      // ── 悬停命中：找距指针最近的粒子 ──
      let hoveredId: string | null = null;
      let hoverNode: (typeof projected)[number] | null = null;
      if (p) {
        for (const q of projected) {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < HIT_RADIUS && (!hoverNode || d < Math.hypot(hoverNode.x - p.x, hoverNode.y - p.y))) {
            hoverNode = q;
          }
        }
        if (hoverNode) hoveredId = hoverNode.id;
      }

      // ── 父子连线：极弱辅助层 ──
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = projected[e.parent];
        const b = projected[e.child];
        if (!a || !b) continue;
        const lit =
          a.id === selId || b.id === selId || a.id === hoveredId || b.id === hoveredId;
        const [r, g, bl] = b.color;
        const alpha = lit ? 0.4 : 0.09;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // ── 粒子绘制：叠加发光精灵，深层先画、根节点最后画 ──
      projected.sort((q, r) => r.depth - q.depth);
      ctx.globalCompositeOperation = 'lighter';

      for (const q of projected) {
        const isHover = q.id === hoveredId;
        const isSel = q.id === selId;
        const boost = isHover ? 1.8 : isSel ? 1.4 : 1;
        const glow = q.size * 8.0 * boost;

        let alpha = q.depth === 0 ? 0.85 : 0.62;
        if (isHover) alpha = Math.min(1, alpha + 0.3);
        if (isSel) alpha = Math.min(1, alpha + 0.2);

        const sprite = sprites.get(q.type) ?? sprites.get(LifeTreeNodeType.CATEGORY);
        if (!sprite) continue;

        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, q.x - glow, q.y - glow, glow * 2, glow * 2);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // ── 选中粒子：脉动光环 ──
      if (selId) {
        const sel = projected.find((q) => q.id === selId);
        if (sel) {
          const pulse = 1 + Math.sin(t * 0.08) * 0.12;
          const ringR = sel.size * 5.2 * 1.3 * pulse + 6;
          const [r, g, b] = sel.color;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sel.x, sel.y, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(sel.x, sel.y, ringR + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ── 悬停粒子：辅助细环 ──
      if (hoveredId && hoveredId !== selId && hoverNode) {
        const [r, g, b] = hoverNode.color;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hoverNode.x, hoverNode.y, hoverNode.size * 5.2 + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 悬停标签：节流更新，避免每帧 setState
      hoverTick++;
      if (hoverTick % 6 === 0) {
        if (hoverNode) {
          const next = {
            id: hoverNode.id,
            title: hoverNode.title,
            x: hoverNode.x,
            y: hoverNode.y,
            color: hoverNode.color,
          };
          setHovered((prev) =>
            prev &&
            prev.id === next.id &&
            Math.abs(prev.x - next.x) < 4 &&
            Math.abs(prev.y - next.y) < 4
              ? prev
              : next,
          );
        } else if (p === null) {
          setHovered(null);
        } else {
          setHovered((prev) => (prev ? null : prev));
        }
      }

      if (!reduceMotion) frame++;
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [seed]);

  const tagStyle: CSSProperties = {
    position: 'absolute',
    left: hovered?.x,
    top: hovered?.y,
    transform: 'translate(-50%, calc(-100% - 12px))',
    display: 'inline-block',
    maxWidth: 280,
    padding: '4px 10px',
    borderRadius: 9999,
    background: 'var(--color-glass-strong)',
    border: '1px solid var(--color-border)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ minHeight: 480 }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: 'none', cursor: 'pointer' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        role="img"
        aria-label="生命树粒子云神经元：每个发光粒子是一个生命树节点，点击可选中查看详情"
      />

      {/* 悬停标题标签 */}
      {hovered ? (
        <span style={tagStyle}>
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{
              backgroundColor: `rgb(${hovered.color.join(',')})`,
              boxShadow: `0 0 6px rgba(${hovered.color.join(',')}, 0.8)`,
            }}
          />
          {hovered.title}
        </span>
      ) : null}

      {/* 节点类型图例 */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1">
        {TYPE_ORDER.map((t) => {
          const c = TYPE_COLOR[t];
          return (
            <span
              key={t}
              className="flex items-center gap-1.5 text-3xs text-text-muted"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: `rgb(${c.join(',')})`,
                  boxShadow: `0 0 6px rgba(${c.join(',')}, 0.7)`,
                }}
              />
              {lifeTreeNodeTypeLabels[t]}
            </span>
          );
        })}
      </div>

      {/* 操作提示 */}
      <div className="pointer-events-none absolute bottom-3 right-3 text-3xs text-text-subtle">
        点击粒子选择节点 · 移动指针视差
      </div>
    </div>
  );
}
