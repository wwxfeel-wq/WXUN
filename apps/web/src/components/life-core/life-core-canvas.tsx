'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * SuiYan Life Core — 整体神经元树状生命云 V3
 * ─────────────────────────────────────────────────────────────
 * 主体是「从根部向上生长的神经元树」：粗壮的轴突主干从底部中心向上延伸，
 * 不断分叉成更细的树突，末端形成发光的突触簇。信号脉冲沿分支流动，
 * 整体呈现鲜活、连续、有机的生命感。
 *
 * 节点绑定四类真实数据：
 * - memory    长期记忆   记忆金
 * - event     家庭事件   生命紫
 * - knowledge 知识文档   灰蓝
 * - agent     Agent 活动 时墨绿
 *
 * 交互：
 * - 指针移动 → 整棵树轻微视差转动 + 节点被轻轻推开
 * - 指针悬停 → 最近的节点放大点亮，浮出数据类别
 * - 点击     → 从落点扩散一圈激活涟漪，信号沿树传播
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

interface Node {
  kind: NodeKind;
  x: number;
  y: number;
  depth: number;
  branchIndex: number;
  t: number;
  phase: number;
  drift: number;
  activation: number;
  birth: number;
  /** 相对 scale 的尺寸系数 */
  size: number;
  parent: number;
  isSynapse: boolean;
}

interface Branch {
  parent: number;
  angle: number;
  length: number;
  attachT: number;
  depth: number;
  nodeCount: number;
  curveOffset: number;
  maxDepth: number;
  color: [number, number, number];
}

interface Pulse {
  branchIndex: number;
  t: number;
  speed: number;
  life: number;
  color: [number, number, number];
}

interface Synapse {
  branchIndex: number;
  angle: number;
  dist: number;
  size: number;
  phase: number;
}

const NODE_COLOR: Record<NodeKind, [number, number, number]> = {
  memory: [255, 210, 100],
  event: [185, 150, 255],
  knowledge: [170, 205, 235],
  agent: [0, 242, 180],
};

const KIND_LABEL: Record<NodeKind, string> = {
  memory: '长期记忆',
  event: '家庭事件',
  knowledge: '知识文档',
  agent: 'Agent 活动',
};

const KIND_CAP: Record<NodeKind, number> = {
  memory: 110,
  event: 75,
  knowledge: 95,
  agent: 45,
};

function scaleCount(raw: number, cap: number): number {
  if (raw <= 0) return 0;
  const scaled = Math.round(Math.log2(raw + 1) * 14);
  return Math.max(5, Math.min(cap, scaled));
}

function pickKind(kindWeights: Record<NodeKind, number>): NodeKind {
  const total = (Object.values(kindWeights) as number[]).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const kind of Object.keys(kindWeights) as NodeKind[]) {
    r -= kindWeights[kind];
    if (r <= 0) return kind;
  }
  return 'memory';
}

function buildTree(counts: LifeCoreCounts, level: number): { nodes: Node[]; branches: Branch[]; synapses: Synapse[] } {
  const branches: Branch[] = [];
  const maxDepth = Math.min(5, 2 + Math.floor(level / 2));

  // 主干：从底部中心向上，更粗壮的轴突
  branches.push({
    parent: -1,
    angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.06,
    length: 0.34 + Math.random() * 0.05,
    attachT: 0,
    depth: 0,
    nodeCount: 0,
    curveOffset: (Math.random() - 0.5) * 0.04,
    maxDepth,
    color: NODE_COLOR.agent,
  });

  let branchIdx = 0;
  const maxBranches = 62 + level * 6;
  while (branchIdx < branches.length && branches.length < maxBranches) {
    const parent = branches[branchIdx];
    if (parent.depth >= maxDepth) {
      branchIdx++;
      continue;
    }
    const childCount = parent.depth === 0 ? 4 + Math.floor(Math.random() * 2) : parent.depth === 1 ? 3 + Math.floor(Math.random() * 2) : parent.depth === 2 ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 1.5);
    const spread = parent.depth === 0 ? 1.25 : parent.depth === 1 ? 1.35 : parent.depth === 2 ? 1.45 : 1.65;
    for (let c = 0; c < childCount; c++) {
      const angleOffset = (c - (childCount - 1) / 2) * spread / Math.max(1, childCount) + (Math.random() - 0.5) * 0.48;
      branches.push({
        parent: branchIdx,
        angle: parent.angle + angleOffset,
        length: parent.length * (0.52 + Math.random() * 0.22),
        attachT: 0.50 + Math.random() * 0.35,
        depth: parent.depth + 1,
        nodeCount: 0,
        curveOffset: (Math.random() - 0.5) * (0.32 - parent.depth * 0.05),
        maxDepth,
        color: NODE_COLOR.agent,
      });
    }
    branchIdx++;
  }

  const weights: Record<NodeKind, number> = {
    memory: Math.max(0.5, scaleCount(counts.memory, KIND_CAP.memory)),
    event: Math.max(0.5, scaleCount(counts.event, KIND_CAP.event)),
    knowledge: Math.max(0.5, scaleCount(counts.knowledge, KIND_CAP.knowledge)),
    agent: Math.max(0.5, scaleCount(counts.agent, KIND_CAP.agent)),
  };

  const totalNodes = (Object.keys(NODE_COLOR) as NodeKind[]).reduce((sum, kind) => sum + weights[kind], 0);

  const nodes: Node[] = [];
  const branchColorAcc: Record<number, { r: number; g: number; b: number; n: number }> = {};

  // 根节点
  nodes.push({
    kind: 'agent',
    x: 0,
    y: 0,
    depth: -1,
    branchIndex: -1,
    t: 0,
    phase: Math.random() * Math.PI * 2,
    drift: 0.5,
    activation: 0,
    birth: 1,
    size: 0.032,
    parent: -1,
    isSynapse: true,
  });

  let nodeIndex = 1;
  const nodesPerBranch = Math.max(2, Math.floor(totalNodes / branches.length));

  branches.forEach((branch, bi) => {
    const depthFactor = 1 - branch.depth * 0.1;
    const count = Math.max(2, Math.min(9, Math.floor(nodesPerBranch * depthFactor * (0.8 + Math.random() * 0.6))));
    branch.nodeCount = count;

    let br = 0, bg = 0, bb = 0;
    for (let i = 0; i < count; i++) {
      const rawT = (i + 0.5) / count;
      const t = Math.pow(rawT, 0.75 + branch.depth * 0.08);

      const localWeights = { ...weights };
      if (branch.depth === 0) {
        localWeights.agent *= 1.7;
        localWeights.memory *= 1.2;
      } else if (branch.depth >= 2 && t > 0.65) {
        localWeights.event *= 1.6;
        localWeights.knowledge *= 1.4;
      }
      const kind = pickKind(localWeights);
      const color = NODE_COLOR[kind];

      const isSynapse = i === count - 1 && branch.depth >= 1;
      const size = isSynapse ? 0.024 : branch.depth === 0 ? 0.017 : branch.depth === 1 ? 0.014 : branch.depth === 2 ? 0.012 : 0.010;

      br += color[0];
      bg += color[1];
      bb += color[2];

      nodes.push({
        kind,
        x: 0,
        y: 0,
        depth: branch.depth,
        branchIndex: bi,
        t,
        phase: Math.random() * Math.PI * 2,
        drift: 0.3 + Math.random() * 0.7,
        activation: 0,
        birth: 1,
        size,
        parent: i === 0 ? 0 : nodeIndex - 1,
        isSynapse,
      });
      nodeIndex++;
    }
    branchColorAcc[bi] = { r: br / count, g: bg / count, b: bb / count, n: count };
  });

  branches.forEach((b, bi) => {
    const acc = branchColorAcc[bi];
    b.color = [acc.r, acc.g, acc.b];
  });

  // 末端突触簇：在深层分支末端形成发光小球丛
  const synapses: Synapse[] = [];
  branches.forEach((b, bi) => {
    if (b.depth >= Math.max(1, maxDepth - 1)) {
      const clusterCount = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < clusterCount; i++) {
        synapses.push({
          branchIndex: bi,
          angle: Math.random() * Math.PI * 2,
          dist: 0.022 + Math.random() * 0.022,
          size: 0.008 + Math.random() * 0.006,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  });

  return { nodes, branches, synapses };
}

function makeSprite(rgb: [number, number, number], size: number = 96): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const [r, gr, b] = rgb;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 1)`);
    grad.addColorStop(0.08, `rgba(${r}, ${gr}, ${b}, 0.98)`);
    grad.addColorStop(0.2, `rgba(${r}, ${gr}, ${b}, 0.72)`);
    grad.addColorStop(0.42, `rgba(${r}, ${gr}, ${b}, 0.28)`);
    grad.addColorStop(0.7, `rgba(${r}, ${gr}, ${b}, 0.07)`);
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
  const [hovered, setHovered] = useState<{ kind: NodeKind; x: number; y: number } | null>(null);

  const seed = useMemo(() => buildTree(counts, level), [counts.memory, counts.event, counts.knowledge, counts.agent, level]);

  const stateRef = useRef<LifeCoreState>(state);
  stateRef.current = state;

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const ripples = useRef<{ x: number; y: number; age: number }[]>([]);
  const pulses = useRef<Pulse[]>([]);

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
    ripples.current.push({ x, y, age: 0 });
    if (ripples.current.length > 5) ripples.current.shift();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = seed.nodes.map((n) => ({ ...n }));
    const branches = seed.branches.map((b) => ({ ...b }));
    const synapses = seed.synapses.map((s) => ({ ...s }));

    if (stateRef.current === 'learning') {
      nodes.slice(-10).forEach((n) => { n.birth = 0; });
    }

    const sprites = {
      memory: makeSprite(NODE_COLOR.memory),
      event: makeSprite(NODE_COLOR.event),
      knowledge: makeSprite(NODE_COLOR.knowledge),
      agent: makeSprite(NODE_COLOR.agent),
    } as Record<NodeKind, HTMLCanvasElement>;

    const synapseSprite = makeSprite([255, 255, 255], 48);

    let width = 0, height = 0, dpr = 1;

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
    let tiltX = 0, tiltY = 0;
    let hoverTick = 0;

    const pointOnBranch = (
      bData: Float64Array,
      branchIndex: number,
      t: number,
      scale: number,
    ): { x: number; y: number; angle: number } => {
      const b = branches[branchIndex];
      const sx = bData[branchIndex * 4];
      const sy = bData[branchIndex * 4 + 1];
      const ex = bData[branchIndex * 4 + 2];
      const ey = bData[branchIndex * 4 + 3];

      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (sx + ex) / 2 + (-dy / len) * b.curveOffset * scale;
      const cy = (sy + ey) / 2 + (dx / len) * b.curveOffset * scale;

      const invT = 1 - t;
      const x = invT * invT * sx + 2 * invT * t * cx + t * t * ex;
      const y = invT * invT * sy + 2 * invT * t * cy + t * t * ey;

      const tx = 2 * invT * (cx - sx) + 2 * t * (ex - cx);
      const ty = 2 * invT * (cy - sy) + 2 * t * (ey - cy);
      const angle = Math.atan2(ty, tx);

      return { x, y, angle };
    };

    const computeBranchGeometry = (scale: number, cx: number, cy: number) => {
      const branchData = new Float64Array(branches.length * 4);
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        let sx: number, sy: number;
        if (b.parent === -1) {
          sx = cx;
          sy = cy + scale * 0.36;
        } else {
          const pPos = pointOnBranch(branchData, b.parent, b.attachT, scale);
          sx = pPos.x;
          sy = pPos.y;
        }
        const bl = b.length * scale;
        const ex = sx + Math.cos(b.angle) * bl;
        const ey = sy + Math.sin(b.angle) * bl;
        branchData[i * 4] = sx;
        branchData[i * 4 + 1] = sy;
        branchData[i * 4 + 2] = ex;
        branchData[i * 4 + 3] = ey;
      }
      return branchData;
    };

    const drawBranchCurve = (
      bData: Float64Array,
      branchIndex: number,
      scale: number,
      baseWidth: number,
      baseAlpha: number,
      glow: boolean,
    ) => {
      const b = branches[branchIndex];
      const [r, g, bl] = b.color;
      const segments = 16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 0; i < segments; i++) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const p0 = pointOnBranch(bData, branchIndex, t0, scale);
        const p1 = pointOnBranch(bData, branchIndex, t1, scale);

        const taper = 1 - (t0 * 0.55);
        const depthFade = 1 - b.depth * 0.12;
        const alpha = baseAlpha * depthFade * (0.55 + taper * 0.45);
        const width = baseWidth * taper * (1 - b.depth * 0.12);

        if (glow) {
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${(alpha * 0.35).toFixed(3)})`;
          ctx.lineWidth = width * 3.5;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, width);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }
    };

    const render = () => {
      const currentState = stateRef.current;
      const cx = width / 2;
      const cy = height * 0.62;
      const baseScale = Math.min(width, height) * 0.48;

      const breath = Math.sin((frame / 240) * Math.PI * 2);
      const breathScale = currentState === 'companion' ? 1 + breath * 0.025 : 1;
      const growPulse = currentState === 'growing' ? 1 + Math.sin((frame / 150) * Math.PI * 2) * 0.05 : 1;
      const scale = baseScale * breathScale * growPulse;

      const p = pointer.current;
      const targetX = p ? ((p.x - cx) / (width || 1)) * 0.5 : 0;
      const targetY = p ? ((p.y - cy) / (height || 1)) * 0.35 : 0;
      tiltX += (targetX - tiltX) * 0.05;
      tiltY += (targetY - tiltY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // 根部环境光晕：极微弱，只给根系一个淡淡的呼吸底光
      const rootGlow = ctx.createRadialGradient(cx, cy + scale * 0.36, 0, cx, cy + scale * 0.36, baseScale * 0.55);
      const rootAlpha = 0.06 + (currentState === 'companion' ? breath * 0.02 : 0.01);
      rootGlow.addColorStop(0, `rgba(0, 229, 168, ${Math.max(0.04, rootAlpha).toFixed(3)})`);
      rootGlow.addColorStop(0.6, 'rgba(0, 229, 168, 0.02)');
      rootGlow.addColorStop(1, 'rgba(0, 229, 168, 0)');
      ctx.fillStyle = rootGlow;
      ctx.beginPath();
      ctx.arc(cx, cy + scale * 0.36, baseScale * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // 回忆状态逐个点亮
      if (currentState === 'recalling' && frame % 6 === 0 && nodes.length > 0) {
        recallCursor = (recallCursor + 1) % nodes.length;
        nodes[recallCursor].activation = 1;
      }

      // 涟漪老化
      for (const rp of ripples.current) rp.age += 1;
      ripples.current = ripples.current.filter((rp) => rp.age < 100);

      // 随机生成流动脉冲
      if (frame % 28 === 0 && branches.length > 0) {
        const bi = Math.floor(Math.random() * branches.length);
        const parentKind = nodes.find((n) => n.branchIndex === bi)?.kind ?? 'agent';
        pulses.current.push({
          branchIndex: bi,
          t: 0,
          speed: 0.005 + Math.random() * 0.004,
          life: 1,
          color: NODE_COLOR[parentKind],
        });
      }
      for (const pulse of pulses.current) {
        pulse.t += pulse.speed;
        pulse.life -= 0.005;
      }
      pulses.current = pulses.current.filter((pulse) => pulse.t < 1.15 && pulse.life > 0);

      const bData = computeBranchGeometry(scale, cx, cy);

      // 更新节点位置
      const projected: { x: number; y: number; alpha: number; n: Node; depth: number }[] = [];

      for (let ni = 0; ni < nodes.length; ni++) {
        const n = nodes[ni];
        if (n.birth < 1) n.birth = Math.min(1, n.birth + 0.012);
        if (n.activation > 0) n.activation = Math.max(0, n.activation - 0.007);

        let x: number, y: number;
        if (n.branchIndex === -1) {
          x = cx;
          y = cy + scale * 0.36;
        } else {
          const pos = pointOnBranch(bData, n.branchIndex, n.t, scale);
          x = pos.x;
          y = pos.y;
        }

        const sway = Math.sin(frame * 0.0045 + n.phase + n.depth * 0.6) * (2.2 + n.depth);
        x += sway;
        y += Math.cos(frame * 0.003 + n.phase) * 1.6;

        x += tiltX * (16 + n.depth * 8);
        y += tiltY * (10 + n.depth * 5);

        if (p) {
          const dx = x - p.x;
          const dy = y - p.y;
          const d2 = dx * dx + dy * dy;
          const reach = baseScale * 0.28;
          if (d2 < reach * reach && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / reach) * 14;
            x += (dx / d) * push;
            y += (dy / d) * push;
          }
        }

        for (const rp of ripples.current) {
          const rd = Math.hypot(x - rp.x, y - rp.y);
          const front = (rp.age / 100) * baseScale * 1.4;
          if (Math.abs(rd - front) < baseScale * 0.08) {
            n.activation = Math.max(n.activation, 1 - rp.age / 100);
          }
        }

        const birthEase = n.birth * n.birth * (3 - 2 * n.birth);
        const depthFade = 1 - Math.max(0, n.depth) * 0.06;
        const alpha = (0.55 + depthFade * 0.35) * birthEase;

        projected.push({ x, y, alpha, n, depth: n.depth });
      }

      // 绘制分支：先极细发光层再实体层，避免分支融成光斑
      for (let bi = 0; bi < branches.length; bi++) {
        drawBranchCurve(bData, bi, scale, 2.4, 0.06, true);
        drawBranchCurve(bData, bi, scale, 1.1, 0.16, false);
      }

      // 绘制脉冲
      ctx.globalCompositeOperation = 'lighter';
      for (const pulse of pulses.current) {
        if (pulse.branchIndex < 0 || pulse.branchIndex >= branches.length) continue;
        const pos = pointOnBranch(bData, pulse.branchIndex, Math.min(pulse.t, 1), scale);
        const [r, g, b] = pulse.color;
        const glow = 4 * pulse.life;
        ctx.globalAlpha = pulse.life * 0.65;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pulse.life})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glow, 0, Math.PI * 2);
        ctx.fill();
      }

      // 绘制突触簇：小而克制，只在末端形成微光点
      for (const syn of synapses) {
        const tip = pointOnBranch(bData, syn.branchIndex, 1, scale);
        const sx = tip.x + Math.cos(syn.angle + frame * 0.003 + syn.phase) * syn.dist * scale;
        const sy = tip.y + Math.sin(syn.angle + frame * 0.003 + syn.phase) * syn.dist * scale;
        const glow = syn.size * scale * 6;
        ctx.globalAlpha = 0.35 + Math.sin(frame * 0.05 + syn.phase) * 0.12;
        ctx.drawImage(synapseSprite, sx - glow, sy - glow, glow * 2, glow * 2);
      }

      // 绘制节点：远的先画
      projected.sort((a, b) => b.depth - a.depth);

      let best: { kind: NodeKind; x: number; y: number; d: number } | null = null;

      for (const q of projected) {
        const lit = q.n.activation;
        const isSynapse = q.n.isSynapse;
        const baseSize = isSynapse ? q.n.size * 1.25 : q.n.size;
        const glow = baseSize * scale * (3.8 + lit * 2.2);
        const alpha = Math.min(1, q.alpha * 0.85 + lit * 0.45);

        ctx.globalAlpha = alpha;

        if (isSynapse && lit > 0.2) {
          ctx.drawImage(synapseSprite, q.x - glow * 0.5, q.y - glow * 0.5, glow, glow);
        }

        ctx.drawImage(sprites[q.n.kind], q.x - glow, q.y - glow, glow * 2, glow * 2);

        if (p) {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 28 && (!best || d < best.d)) {
            best = { kind: q.n.kind, x: q.x, y: q.y, d };
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // 悬停节点额外发光环
      if (best) {
        ctx.globalCompositeOperation = 'lighter';
        const [r, g, b] = NODE_COLOR[best.kind];
        const hoverGlow = ctx.createRadialGradient(best.x, best.y, 0, best.x, best.y, 18);
        hoverGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`);
        hoverGlow.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
        hoverGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = hoverGlow;
        ctx.beginPath();
        ctx.arc(best.x, best.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // 悬停标签
      hoverTick++;
      if (hoverTick % 5 === 0) {
        if (best) {
          setHovered((prev) =>
            prev && prev.kind === best!.kind && Math.abs(prev.x - best!.x) < 8
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
