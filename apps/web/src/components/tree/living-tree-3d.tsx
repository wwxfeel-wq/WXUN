'use client';

/**
 * LivingTree3D —— 有机生命树 Phase 6
 *
 * 视觉方向：
 * - 真正的有机生命树：树根、树干、枝干、树叶、花、果实、树液
 * - 柔和的 Apple / VisionOS 审美：暖色、自然材质、克制光感
 * - 无粒子、无 Bloom、无过度发光、无赛博朋克蓝
 *
 * 数据隐喻：
 * - 树根  = Memory     记忆数量增加 → 树根密度增加
 * - 树干  = Knowledge  知识库规模  → 树干粗细变化
 * - 枝干  = Family     主枝对应家庭成员，颜色/数量随家人变化
 * - 树叶  = Story      叶片数量随故事/记忆增加
 * - 花    = Milestone  特殊节点开花（ bloom+ 阶段）
 * - 果实  = TimeCapsule 成熟枝干结果（ fruit/eternal 阶段）
 * - 树液  = Reasoning  枝干中微弱流动的光泽
 * - 神经脉络 = AI Consciousness 树内部极淡脉动，不主导画面
 */

import * as THREE from 'three';
import type { JSX } from 'react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import TreeCanvas2D from './tree-canvas-2d';

/* ============================================================================
 * 类型
 * ========================================================================== */

export type GrowthStage = 'seed' | 'sprout' | 'young' | 'mature' | 'bloom' | 'fruit' | 'eternal';

export interface FamilyMember {
  id: string;
  name: string;
  color: string;
}

export interface LivingTree3DProps {
  growthStage?: GrowthStage;
  /** @deprecated 保留以兼容旧接口，当前实现不随季节切换 */
  season?: string;
  familyMembers?: FamilyMember[];
  memoryCount?: number;
  /** Number of family stories / memories that map to leaf density. */
  storyCount?: number;
  /** Number of time capsules that map to fruits. */
  timeCapsuleCount?: number;
  /** Number of milestones / anniversaries that map to flowers. */
  milestoneCount?: number;
  /** Long-term memory + knowledge root count that drives root density. */
  knowledgeRootCount?: number;
  className?: string;
}

interface StageConfig {
  stageIndex: number;
  maxDepth: number;
  mainBranches: number;
  treeScale: number;
  trunkHeight: number;
  baseRadius: number;
  baseLeaves: number;
  maxLeaves: number;
  baseFlowers: number;
  maxFlowers: number;
  baseFruits: number;
  maxFruits: number;
  baseRoots: number;
  maxRoots: number;
  sapCount: number;
  branchSegs: number;
  trunkSegs: number;
}

interface BranchNode {
  start: THREE.Vector3;
  end: THREE.Vector3;
  ctrl: THREE.Vector3;
  depth: number;
  familyIndex: number;
  rStart: number;
  rEnd: number;
  children: BranchNode[];
}

interface RootSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  rStart: number;
  rEnd: number;
}

interface Anchor {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  color: THREE.Color;
  familyIndex: number;
}

interface SapParticle {
  branchIndex: number;
  offset: number;
  speed: number;
  phase: number;
}

interface TreeAssets {
  branches: BranchNode[];
  rootSegments: RootSegment[];
  leafAnchors: Anchor[];
  flowerAnchors: Anchor[];
  fruitAnchors: Anchor[];
  sapParticles: SapParticle[];
  innerGlowPositions: Float32Array;
  familyColors: THREE.Color[];
  trunkColor: THREE.Color;
  branchColor: THREE.Color;
  leafColor: THREE.Color;
  flowerColor: THREE.Color;
  fruitColor: THREE.Color;
  sapColor: THREE.Color;
  rootColor: THREE.Color;
  innerGlowColor: THREE.Color;
  stage: StageConfig;
  stageIndex: number;
  familyKey: string;
}

/* ============================================================================
 * 常量
 * ========================================================================== */

const STAGE_CONFIG: Record<GrowthStage, StageConfig> = {
  seed: {
    stageIndex: 0,
    maxDepth: 0,
    mainBranches: 0,
    treeScale: 0.34,
    trunkHeight: 0.5,
    baseRadius: 0.055,
    baseLeaves: 0,
    maxLeaves: 0,
    baseFlowers: 0,
    maxFlowers: 0,
    baseFruits: 0,
    maxFruits: 0,
    baseRoots: 4,
    maxRoots: 8,
    sapCount: 0,
    branchSegs: 4,
    trunkSegs: 8,
  },
  sprout: {
    stageIndex: 1,
    maxDepth: 2,
    mainBranches: 3,
    treeScale: 0.62,
    trunkHeight: 1.0,
    baseRadius: 0.095,
    baseLeaves: 36,
    maxLeaves: 110,
    baseFlowers: 0,
    maxFlowers: 8,
    baseFruits: 0,
    maxFruits: 4,
    baseRoots: 6,
    maxRoots: 16,
    sapCount: 10,
    branchSegs: 5,
    trunkSegs: 10,
  },
  young: {
    stageIndex: 2,
    maxDepth: 3,
    mainBranches: 4,
    treeScale: 0.92,
    trunkHeight: 1.55,
    baseRadius: 0.14,
    baseLeaves: 130,
    maxLeaves: 340,
    baseFlowers: 10,
    maxFlowers: 36,
    baseFruits: 0,
    maxFruits: 14,
    baseRoots: 10,
    maxRoots: 26,
    sapCount: 22,
    branchSegs: 6,
    trunkSegs: 12,
  },
  mature: {
    stageIndex: 3,
    maxDepth: 4,
    mainBranches: 5,
    treeScale: 1.18,
    trunkHeight: 2.1,
    baseRadius: 0.20,
    baseLeaves: 300,
    maxLeaves: 680,
    baseFlowers: 26,
    maxFlowers: 80,
    baseFruits: 10,
    maxFruits: 34,
    baseRoots: 14,
    maxRoots: 40,
    sapCount: 36,
    branchSegs: 7,
    trunkSegs: 14,
  },
  bloom: {
    stageIndex: 4,
    maxDepth: 5,
    mainBranches: 6,
    treeScale: 1.34,
    trunkHeight: 2.45,
    baseRadius: 0.25,
    baseLeaves: 450,
    maxLeaves: 1050,
    baseFlowers: 65,
    maxFlowers: 150,
    baseFruits: 20,
    maxFruits: 60,
    baseRoots: 16,
    maxRoots: 50,
    sapCount: 48,
    branchSegs: 7,
    trunkSegs: 14,
  },
  fruit: {
    stageIndex: 5,
    maxDepth: 5,
    mainBranches: 7,
    treeScale: 1.50,
    trunkHeight: 2.7,
    baseRadius: 0.29,
    baseLeaves: 540,
    maxLeaves: 1350,
    baseFlowers: 85,
    maxFlowers: 190,
    baseFruits: 55,
    maxFruits: 120,
    baseRoots: 18,
    maxRoots: 60,
    sapCount: 58,
    branchSegs: 8,
    trunkSegs: 16,
  },
  eternal: {
    stageIndex: 6,
    maxDepth: 5,
    mainBranches: 8,
    treeScale: 1.64,
    trunkHeight: 2.9,
    baseRadius: 0.33,
    baseLeaves: 680,
    maxLeaves: 1750,
    baseFlowers: 110,
    maxFlowers: 250,
    baseFruits: 90,
    maxFruits: 190,
    baseRoots: 22,
    maxRoots: 75,
    sapCount: 70,
    branchSegs: 8,
    trunkSegs: 16,
  },
};

const DEFAULT_FAMILY: FamilyMember[] = [
  { id: 'papa', name: '爸爸', color: 'var(--color-family-father)' },
  { id: 'mama', name: '妈妈', color: 'var(--color-family-mother)' },
  { id: 'child', name: '孩子', color: 'var(--color-family-child)' },
  { id: 'elder', name: '老人', color: 'var(--color-family-elder)' },
  { id: 'pet', name: '宠物', color: 'var(--color-family-pet)' },
];

const GROWTH_STAGE_ORDER: GrowthStage[] = ['seed', 'sprout', 'young', 'mature', 'bloom', 'fruit', 'eternal'];

/* ============================================================================
 * 工具函数
 * ========================================================================== */

function resolveColor(value: string): string {
  if (typeof window === 'undefined') return value;
  const m = value.match(/^var\((--[^)]+)\)$/);
  if (!m) return value;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || value;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stageIndex(stage: GrowthStage): number {
  return GROWTH_STAGE_ORDER.indexOf(stage);
}

function sampleQuadraticBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, segments: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const it = 1 - t;
    const w0 = it * it;
    const w1 = 2 * it * t;
    const w2 = t * t;
    pts.push(
      new THREE.Vector3()
        .addScaledVector(p0, w0)
        .addScaledVector(p1, w1)
        .addScaledVector(p2, w2),
    );
  }
  return pts;
}

function bezierPoint(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number): THREE.Vector3 {
  const it = 1 - t;
  return new THREE.Vector3()
    .addScaledVector(p0, it * it)
    .addScaledVector(p1, 2 * it * t)
    .addScaledVector(p2, t * t);
}

function randomAxis(rng: () => number): THREE.Vector3 {
  return new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
}

function createLeafGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.07, 0.12, 0.07, 0.22, 0, 0.34);
  shape.bezierCurveTo(-0.07, 0.22, -0.07, 0.12, 0, 0);
  return new THREE.ShapeGeometry(shape, 2);
}

/* ============================================================================
 * 有机生命树生成（类 L-System 递归分枝 + 曲线拟合）
 * ========================================================================== */

function generateTree(
  stage: GrowthStage,
  family: FamilyMember[],
  perfMultiplier: number,
  storyCount: number,
  timeCapsuleCount: number,
  milestoneCount: number,
  knowledgeRootCount: number,
): TreeAssets {
  const cfg = STAGE_CONFIG[stage];
  const idx = stageIndex(stage);
  const familyKey = family.map((f) => `${f.id}:${f.color}`).join('|');
  const seed = hashString(`${stage}:${familyKey}`);
  const rng = mulberry32(seed);

  const familyColors = family.map((f) => new THREE.Color(resolveColor(f.color)));
  const trunkColor = new THREE.Color(resolveColor('var(--color-tree-trunk)'));
  const branchColor = new THREE.Color(resolveColor('var(--color-tree-branch)'));
  const leafBase = new THREE.Color(resolveColor('var(--color-tree-leaf)'));
  const flowerBase = new THREE.Color(resolveColor('var(--color-tree-flower)'));
  const fruitBase = new THREE.Color(resolveColor('var(--color-tree-fruit)'));
  const sapBase = new THREE.Color(resolveColor('var(--color-tree-sap)'));
  const rootBase = new THREE.Color(resolveColor('var(--color-tree-root)'));
  const innerGlowBase = new THREE.Color(resolveColor('var(--color-tree-neural)'));

  const branches: BranchNode[] = [];
  const leafAnchors: Anchor[] = [];
  const flowerAnchors: Anchor[] = [];
  const fruitAnchors: Anchor[] = [];
  const sapParticles: SapParticle[] = [];

  // 知识与规模因子（树干粗细、整体尺寸）
  const knowledgeScale = Math.min(2.2, 0.6 + idx * 0.28 + family.length * 0.07);
  const scale = cfg.treeScale;
  const trunkHeight = cfg.trunkHeight;
  const baseRadius = cfg.baseRadius * knowledgeScale;

  // 树干：从地底一点向上生长，带轻微弯曲
  const trunkBase = new THREE.Vector3(0, -trunkHeight * 0.35, 0);
  const trunkTop = new THREE.Vector3(0, trunkHeight * 0.65, 0);
  const bend = new THREE.Vector3(
    (rng() - 0.5) * trunkHeight * 0.35,
    trunkHeight * 0.35,
    (rng() - 0.5) * trunkHeight * 0.22,
  );
  const trunkCtrl = trunkBase.clone().add(bend);

  const mainBranchCount = Math.max(1, Math.min(cfg.mainBranches, family.length || 1));

  function growBranch(
    start: THREE.Vector3,
    end: THREE.Vector3,
    ctrl: THREE.Vector3,
    depth: number,
    rStart: number,
    rEnd: number,
    familyIndex: number,
  ) {
    const node: BranchNode = {
      start,
      end,
      ctrl,
      depth,
      familyIndex,
      rStart,
      rEnd,
      children: [],
    };
    branches.push(node);

    if (depth >= cfg.maxDepth) return node;

    const childCount =
      depth === 0
        ? mainBranchCount
        : rng() < 0.38
          ? 2
          : 3;

    const parentDir = end.clone().sub(start).normalize();

    for (let i = 0; i < childCount; i++) {
      let dir: THREE.Vector3;
      if (depth === 0) {
        const angle = (i / Math.max(1, childCount)) * Math.PI * 2 + (rng() - 0.5) * 0.6;
        const up = 0.45 + rng() * 0.35;
        dir = new THREE.Vector3(Math.cos(angle) * 0.75, up, Math.sin(angle) * 0.75).normalize();
      } else {
        const axis = randomAxis(rng);
        const spread = 0.45 + rng() * 0.35;
        dir = parentDir
          .clone()
          .applyAxisAngle(axis, spread + (rng() - 0.5) * 0.25)
          .normalize();
        dir.y += 0.18;
        dir.normalize();
      }

      const lenScale = depth === 0 ? 0.55 + rng() * 0.25 : 0.62 + rng() * 0.22;
      const len = trunkHeight * lenScale * (depth === 0 ? 0.55 : Math.pow(0.78, depth - 1)) * scale;
      const childStart = end.clone();
      const childEnd = childStart.clone().add(dir.multiplyScalar(len));

      const mid = childStart.clone().lerp(childEnd, 0.5);
      const perp = dir
        .clone()
        .cross(randomAxis(rng))
        .normalize()
        .multiplyScalar(len * (0.12 + rng() * 0.12));
      const childCtrl = mid.add(perp);

      const childRStart = depth === 0 ? rEnd * 0.92 : rEnd * 0.78;
      const childREnd = childRStart * (0.55 + rng() * 0.18);
      const childFamily = depth === 0 ? i % familyColors.length : familyIndex;

      const child = growBranch(childStart, childEnd, childCtrl, depth + 1, childRStart, childREnd, childFamily);
      node.children.push(child);
    }

    return node;
  }

  growBranch(trunkBase, trunkTop, trunkCtrl, 0, baseRadius, baseRadius * 0.55, -1);

  // 树叶、花、果实的锚点（密度由真实家庭数据驱动）
  const storyDensity = Math.min(1, 0.15 + storyCount / 600);
  const milestoneDensity = Math.min(1, 0.12 + milestoneCount / 80);
  const capsuleDensity = Math.min(1, 0.12 + timeCapsuleCount / 60);
  const maxLeafCount = Math.floor(cfg.maxLeaves * perfMultiplier * storyDensity);
  const maxFlowerCount = Math.floor(cfg.maxFlowers * perfMultiplier * milestoneDensity);
  const maxFruitCount = Math.floor(cfg.maxFruits * perfMultiplier * capsuleDensity);

  const tipBranches = branches.filter((b) => b.depth >= 2);
  let anchorIndex = 0;

  for (const b of tipBranches) {
    if (leafAnchors.length >= maxLeafCount + maxFlowerCount + maxFruitCount) break;

    const leafCountOnBranch = Math.max(1, Math.min(4, 5 - b.depth));

    for (let i = 0; i < leafCountOnBranch; i++) {
      if (leafAnchors.length >= maxLeafCount + maxFlowerCount + maxFruitCount) break;
      const t = 0.45 + rng() * 0.55;
      const pos = bezierPoint(b.start, b.ctrl, b.end, t);
      pos.x += (rng() - 0.5) * 0.12;
      pos.y += (rng() - 0.5) * 0.12;
      pos.z += (rng() - 0.5) * 0.12;

      const normal = b.end.clone().sub(b.start).normalize();
      // 叶面朝外，稍微向上
      normal.y += 0.25;
      normal.normalize();

      const familyColor = familyColors[b.familyIndex % familyColors.length];
      const leafC = leafBase.clone().lerp(familyColor, 0.12 + rng() * 0.08);
      leafC.multiplyScalar(0.85 + rng() * 0.25);

      const anchor: Anchor = { position: pos, normal, color: leafC, familyIndex: b.familyIndex };

      if (anchorIndex % 9 === 0 && flowerAnchors.length < maxFlowerCount) {
        const fc = flowerBase.clone().lerp(familyColor, 0.08 + rng() * 0.1);
        flowerAnchors.push({ ...anchor, color: fc });
      } else if (anchorIndex % 17 === 0 && fruitAnchors.length < maxFruitCount) {
        const fc = fruitBase.clone().lerp(familyColor, 0.05 + rng() * 0.08);
        fruitAnchors.push({ ...anchor, color: fc });
      } else if (leafAnchors.length < maxLeafCount) {
        leafAnchors.push(anchor);
      }
      anchorIndex++;
    }
  }

  // 树液：沿主要枝干缓慢流动
  const maxSap = Math.floor(cfg.sapCount * perfMultiplier);
  for (let i = 0; i < branches.length && sapParticles.length < maxSap; i++) {
    const b = branches[i];
    if (b.depth === 0) continue; // 不在主干上抢戏
    const n = Math.max(1, 3 - b.depth);
    for (let j = 0; j < n && sapParticles.length < maxSap; j++) {
      sapParticles.push({
        branchIndex: i,
        offset: rng(),
        speed: 0.03 + rng() * 0.04,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // 树根：长期记忆 / Knowledge Root 密度
  const rootSegments: RootSegment[] = [];
  const rootDensity = Math.min(1.5, 0.4 + knowledgeRootCount / 300);
  const maxRoots = Math.floor(cfg.maxRoots * perfMultiplier * rootDensity);
  const rootDepth = Math.min(4, 2 + Math.floor(idx / 2));

  function growRoot(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) {
    if (depth > rootDepth) return;
    const end = start.clone().add(direction.clone().multiplyScalar(length));
    const mid = start.clone().lerp(end, 0.5);
    const perp = direction
      .clone()
      .cross(randomAxis(rng))
      .normalize()
      .multiplyScalar(length * (0.15 + rng() * 0.15));
    const ctrl = mid.add(perp);

    // 用两段曲线让根更自然
    const pts = sampleQuadraticBezier(start, ctrl, end, 3);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b2 = pts[i + 1];
      const t = i / (pts.length - 1);
      const r0 = radius * (1 - t * 0.35);
      const r1 = radius * (1 - ((i + 1) / (pts.length - 1)) * 0.35);
      rootSegments.push({ start: a, end: b2, rStart: r0, rEnd: r1 });
    }

    const childCount = depth < rootDepth ? (rng() < 0.45 ? 1 : 2) : 0;
    for (let c = 0; c < childCount; c++) {
      const angleOffset = (rng() - 0.5) * 1.0;
      const downBias = new THREE.Vector3(0, -0.35, 0);
      const childDir = direction
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
        .add(downBias)
        .normalize();
      growRoot(end, childDir, length * (0.62 + rng() * 0.18), radius * 0.62, depth + 1);
    }
  }

  for (let i = 0; i < maxRoots; i++) {
    const angle = (i / Math.max(1, maxRoots)) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const dir = new THREE.Vector3(
      Math.cos(angle) * 0.65,
      -0.55 - rng() * 0.25,
      Math.sin(angle) * 0.65,
    ).normalize();
    const len = trunkHeight * (0.25 + rng() * 0.25) * scale;
    growRoot(trunkBase.clone(), dir, len, baseRadius * 0.45, 0);
  }

  // 生命脉络：隐藏于树皮内部的柔和节律，仅在特定时刻透出微光
  const innerGlowLines: number[] = [];
  const innerGlowBranchCount = Math.min(6, branches.length);
  for (let i = 0; i < innerGlowBranchCount; i++) {
    const b = branches[i];
    const inner = sampleQuadraticBezier(b.start, b.ctrl, b.end, 8).map((p) => {
      // 向树干中轴轻微收缩，藏在树皮内部
      const inward = new THREE.Vector3(-p.x * 0.35, 0, -p.z * 0.35).multiplyScalar(0.35);
      return p.clone().add(inward);
    });
    for (let j = 0; j < inner.length - 1; j++) {
      innerGlowLines.push(inner[j].x, inner[j].y, inner[j].z);
      innerGlowLines.push(inner[j + 1].x, inner[j + 1].y, inner[j + 1].z);
    }
  }

  return {
    branches,
    rootSegments,
    leafAnchors,
    flowerAnchors,
    fruitAnchors,
    sapParticles,
    innerGlowPositions: new Float32Array(innerGlowLines),
    familyColors,
    trunkColor,
    branchColor,
    leafColor: leafBase,
    flowerColor: flowerBase,
    fruitColor: fruitBase,
    sapColor: sapBase,
    rootColor: rootBase,
    innerGlowColor: innerGlowBase,
    stage: cfg,
    stageIndex: idx,
    familyKey,
  };
}

/* ============================================================================
 * 场景组件
 * ========================================================================== */

interface SceneProps {
  assets: TreeAssets;
  memoryCount: number;
  storyCount: number;
  timeCapsuleCount: number;
  milestoneCount: number;
  knowledgeRootCount: number;
  family: FamilyMember[];
  perfLevel: PerformanceLevel;
  prefersReducedMotion?: boolean;
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_UP = new THREE.Vector3(0, 0, 1);
const dummy = new THREE.Object3D();
const _color = new THREE.Color();

function TreeScene({
  assets,
  memoryCount,
  storyCount,
  timeCapsuleCount,
  milestoneCount,
  knowledgeRootCount,
  family,
  perfLevel,
  prefersReducedMotion = false,
}: SceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const branchMeshRef = useRef<THREE.InstancedMesh>(null);
  const rootMeshRef = useRef<THREE.InstancedMesh>(null);
  const leafMeshRef = useRef<THREE.InstancedMesh>(null);
  const flowerMeshRef = useRef<THREE.InstancedMesh>(null);
  const fruitMeshRef = useRef<THREE.InstancedMesh>(null);
  const sapMeshRef = useRef<THREE.InstancedMesh>(null);
  const innerGlowMatRef = useRef<THREE.LineBasicMaterial>(null);

  const [autoRotate, setAutoRotate] = useState(!prefersReducedMotion);

  // prefersReducedMotion 变化时同步更新 autoRotate
  useEffect(() => {
    if (prefersReducedMotion) {
      setAutoRotate(false);
    }
  }, [prefersReducedMotion]);

  const [tooltip, setTooltip] = useState<{ visible: boolean; text: string; position: THREE.Vector3 }>({
    visible: false,
    text: '',
    position: new THREE.Vector3(),
  });

  // 当前可见数量与缩放（用于 lerp）
  const countsRef = useRef({
    roots: 0,
    leaves: 0,
    flowers: 0,
    fruits: 0,
    branchScale: 1,
    rootScale: 1,
    leafScale: 1,
    flowerScale: 1,
    fruitScale: 1,
    groupScale: 0.001,
  });

  // R3-FE-019: Track previous scale values to skip matrix updates when
  // the change is below the threshold (0.01), avoiding thousands of
  // unnecessary matrix recalculations per frame.
  const prevScalesRef = useRef({ leaf: 0, flower: 0, fruit: 0 });

  // 根据阶段与真实家庭数据计算目标
  const targets = useMemo(() => {
    const cfg = assets.stage;
    const memory = Math.max(0, memoryCount);
    const stories = Math.max(0, storyCount);
    const milestones = Math.max(0, milestoneCount);
    const capsules = Math.max(0, timeCapsuleCount);
    const roots = Math.max(0, knowledgeRootCount);
    return {
      roots: Math.min(assets.rootSegments.length, cfg.baseRoots + Math.floor(roots / 20)),
      leaves: Math.min(assets.leafAnchors.length, cfg.baseLeaves + Math.floor(stories * 0.6)),
      flowers: cfg.stageIndex >= 3 ? Math.min(assets.flowerAnchors.length, cfg.baseFlowers + Math.floor(milestones * 1.2)) : 0,
      fruits: cfg.stageIndex >= 4 ? Math.min(assets.fruitAnchors.length, cfg.baseFruits + Math.floor(capsules * 1.5)) : 0,
      knowledgeScale: Math.min(2.2, 0.7 + assets.stageIndex * 0.22 + family.length * 0.05 + Math.min(memory, 600) * 0.0012),
      leafScale: 0.4 + assets.stageIndex * 0.12 + Math.min(stories / 600, 0.25),
      flowerScale: cfg.stageIndex >= 3 ? 0.85 + Math.min(milestones / 80, 0.25) : 0,
      fruitScale: cfg.stageIndex >= 4 ? 0.9 + Math.min(capsules / 60, 0.2) : 0,
    };
  }, [assets, memoryCount, storyCount, milestoneCount, timeCapsuleCount, knowledgeRootCount, family.length]);

  // 阶段/家人变化时触发整体缩放入场
  const transitionKey = `${assets.stageIndex}:${assets.familyKey}`;
  useEffect(() => {
    countsRef.current.groupScale = 0.001;
  }, [transitionKey]);

  // 初始化/重建实例矩阵与颜色
  useEffect(() => {
    const branchMesh = branchMeshRef.current;
    const rootMesh = rootMeshRef.current;
    const leafMesh = leafMeshRef.current;
    const flowerMesh = flowerMeshRef.current;
    const fruitMesh = fruitMeshRef.current;
    const sapMesh = sapMeshRef.current;
    if (!branchMesh || !rootMesh || !leafMesh || !flowerMesh || !fruitMesh || !sapMesh) return;

    // 枝干实例
    let branchIdx = 0;
    for (const b of assets.branches) {
      const segs = b.depth === 0 ? assets.stage.trunkSegs : assets.stage.branchSegs;
      const pts = sampleQuadraticBezier(b.start, b.ctrl, b.end, segs);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const c = pts[i + 1];
        const mid = a.clone().add(c).multiplyScalar(0.5);
        const dir = c.clone().sub(a).normalize();
        const len = a.distanceTo(c);
        if (len < 0.001) continue;
        const t = (i + 0.5) / (pts.length - 1);
        const radius = THREE.MathUtils.lerp(b.rStart, b.rEnd, t);

        dummy.position.copy(mid);
        dummy.quaternion.setFromUnitVectors(Y_UP, dir);
        dummy.scale.set(radius, len, radius);
        dummy.updateMatrix();
        branchMesh.setMatrixAt(branchIdx, dummy.matrix);

        // 颜色：主枝继承家庭成员色，次枝自然木色
        if (b.depth === 0) {
          _color.copy(assets.trunkColor).lerp(assets.branchColor, t * 0.4);
        } else if (b.depth === 1 && assets.familyColors[b.familyIndex]) {
          _color.copy(assets.branchColor).lerp(assets.familyColors[b.familyIndex], 0.45);
          _color.multiplyScalar(1 - t * 0.15);
        } else {
          _color.copy(assets.branchColor);
          if (assets.familyColors[b.familyIndex]) {
            _color.lerp(assets.familyColors[b.familyIndex], 0.18);
          }
          _color.multiplyScalar(1 - t * 0.22);
        }
        branchMesh.setColorAt(branchIdx, _color);
        branchIdx++;
      }
    }
    branchMesh.count = branchIdx;
    branchMesh.instanceMatrix.needsUpdate = true;
    if (branchMesh.instanceColor) branchMesh.instanceColor.needsUpdate = true;

    // 树根实例
    for (let i = 0; i < assets.rootSegments.length; i++) {
      const r = assets.rootSegments[i];
      const mid = r.start.clone().add(r.end).multiplyScalar(0.5);
      const dir = r.end.clone().sub(r.start).normalize();
      const len = r.start.distanceTo(r.end);
      dummy.position.copy(mid);
      dummy.quaternion.setFromUnitVectors(Y_UP, dir);
      dummy.scale.set(r.rStart, len, r.rStart);
      dummy.updateMatrix();
      rootMesh.setMatrixAt(i, dummy.matrix);
      _color.copy(assets.rootColor).multiplyScalar(0.85 + (i % 5) * 0.04);
      rootMesh.setColorAt(i, _color);
    }
    rootMesh.count = 0;
    rootMesh.instanceMatrix.needsUpdate = true;
    if (rootMesh.instanceColor) rootMesh.instanceColor.needsUpdate = true;

    // 树叶实例
    for (let i = 0; i < assets.leafAnchors.length; i++) {
      const a = assets.leafAnchors[i];
      dummy.position.copy(a.position);
      dummy.quaternion.setFromUnitVectors(Z_UP, a.normal);
      dummy.rotateZ((i % 7) * 0.8);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
      leafMesh.setColorAt(i, a.color);
    }
    leafMesh.count = 0;
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;

    // 花实例
    for (let i = 0; i < assets.flowerAnchors.length; i++) {
      const a = assets.flowerAnchors[i];
      dummy.position.copy(a.position);
      dummy.rotation.set((i % 3) * 0.4, (i % 5) * 0.9, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(i, dummy.matrix);
      flowerMesh.setColorAt(i, a.color);
    }
    flowerMesh.count = 0;
    flowerMesh.instanceMatrix.needsUpdate = true;
    if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;

    // 果实实例
    for (let i = 0; i < assets.fruitAnchors.length; i++) {
      const a = assets.fruitAnchors[i];
      dummy.position.copy(a.position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      fruitMesh.setMatrixAt(i, dummy.matrix);
      fruitMesh.setColorAt(i, a.color);
    }
    fruitMesh.count = 0;
    fruitMesh.instanceMatrix.needsUpdate = true;
    if (fruitMesh.instanceColor) fruitMesh.instanceColor.needsUpdate = true;

    // 树液实例初始位置
    updateSap(sapMesh, assets, 0);
    sapMesh.count = assets.sapParticles.length;
    sapMesh.instanceMatrix.needsUpdate = true;
  }, [assets]);

  function updateSap(mesh: THREE.InstancedMesh, tree: TreeAssets, time: number) {
    for (let i = 0; i < tree.sapParticles.length; i++) {
      const s = tree.sapParticles[i];
      const b = tree.branches[s.branchIndex];
      if (!b) continue;
      const t = (s.offset + time * s.speed) % 1;
      const pos = bezierPoint(b.start, b.ctrl, b.end, t);
      const pulse = 1 + Math.sin(time * 2 + s.phase) * 0.18;
      dummy.position.copy(pos);
      dummy.rotation.set(time + s.phase, time * 0.7, 0);
      const radius = 0.018 * pulse * (1 - b.depth * 0.08);
      dummy.scale.set(radius, radius, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function updateLeafMatrices(scale: number) {
    const mesh = leafMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < assets.leafAnchors.length; i++) {
      const a = assets.leafAnchors[i];
      dummy.position.copy(a.position);
      dummy.quaternion.setFromUnitVectors(Z_UP, a.normal);
      dummy.rotateZ((i % 7) * 0.8 + Math.sin(i) * 0.2);
      const s = scale * (0.7 + ((i % 5) * 0.08));
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function updateFlowerMatrices(scale: number) {
    const mesh = flowerMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < assets.flowerAnchors.length; i++) {
      const a = assets.flowerAnchors[i];
      dummy.position.copy(a.position);
      dummy.rotation.set((i % 3) * 0.4, (i % 5) * 0.9, 0);
      const s = scale * (0.55 + ((i % 4) * 0.06));
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function updateFruitMatrices(scale: number) {
    const mesh = fruitMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < assets.fruitAnchors.length; i++) {
      const a = assets.fruitAnchors[i];
      dummy.position.copy(a.position);
      dummy.rotation.set(0, 0, 0);
      const s = scale * (0.5 + ((i % 4) * 0.05));
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const c = countsRef.current;

    // 整体入场/过渡缩放
    c.groupScale = THREE.MathUtils.lerp(c.groupScale, 1, dt * 1.8);
    if (groupRef.current) {
      groupRef.current.scale.setScalar(c.groupScale);
    }

    // 数量 lerp
    c.roots = THREE.MathUtils.lerp(c.roots, targets.roots, dt * 2.2);
    c.leaves = THREE.MathUtils.lerp(c.leaves, targets.leaves, dt * 2.0);
    c.flowers = THREE.MathUtils.lerp(c.flowers, targets.flowers, dt * 2.0);
    c.fruits = THREE.MathUtils.lerp(c.fruits, targets.fruits, dt * 2.0);

    const rootMesh = rootMeshRef.current;
    const leafMesh = leafMeshRef.current;
    const flowerMesh = flowerMeshRef.current;
    const fruitMesh = fruitMeshRef.current;
    const sapMesh = sapMeshRef.current;

    if (rootMesh) {
      rootMesh.count = Math.min(assets.rootSegments.length, Math.max(0, Math.round(c.roots)));
      rootMesh.instanceMatrix.needsUpdate = true;
    }
    if (leafMesh) {
      leafMesh.count = Math.min(assets.leafAnchors.length, Math.max(0, Math.round(c.leaves)));
    }
    if (flowerMesh) {
      flowerMesh.count = Math.min(assets.flowerAnchors.length, Math.max(0, Math.round(c.flowers)));
    }
    if (fruitMesh) {
      fruitMesh.count = Math.min(assets.fruitAnchors.length, Math.max(0, Math.round(c.fruits)));
    }

    // 尺寸 lerp
    c.branchScale = THREE.MathUtils.lerp(c.branchScale, targets.knowledgeScale, dt * 1.2);
    c.rootScale = THREE.MathUtils.lerp(c.rootScale, targets.knowledgeScale * 0.9, dt * 1.2);
    c.leafScale = THREE.MathUtils.lerp(c.leafScale, targets.leafScale, dt * 1.4);
    c.flowerScale = THREE.MathUtils.lerp(c.flowerScale, targets.flowerScale, dt * 1.4);
    c.fruitScale = THREE.MathUtils.lerp(c.fruitScale, targets.fruitScale, dt * 1.4);

    if (branchMeshRef.current) {
      branchMeshRef.current.scale.set(c.branchScale, 1, c.branchScale);
    }
    if (rootMesh) {
      rootMesh.scale.set(c.rootScale, 1, c.rootScale);
    }

    // 叶子/花/果矩阵随尺寸更新
    // R3-FE-019: Only update matrices when scale changes more than 0.01,
    // avoiding thousands of unnecessary matrix recalculations per frame.
    const prev = prevScalesRef.current;
    if (Math.abs(c.leafScale - prev.leaf) > 0.01) {
      prev.leaf = c.leafScale;
      updateLeafMatrices(c.leafScale);
    }
    if (Math.abs(c.flowerScale - prev.flower) > 0.01) {
      prev.flower = c.flowerScale;
      updateFlowerMatrices(c.flowerScale);
    }
    if (Math.abs(c.fruitScale - prev.fruit) > 0.01) {
      prev.fruit = c.fruitScale;
      updateFruitMatrices(c.fruitScale);
    }

    // 树液流动
    if (sapMesh) {
      updateSap(sapMesh, assets, t);
    }

    // 生命节律：树皮内部柔和微光，仅在呼吸间隐约透出
    if (innerGlowMatRef.current) {
      const pulse = 0.035 + 0.022 * (0.5 + 0.5 * Math.sin(t * 0.8 + 0.5));
      innerGlowMatRef.current.opacity = pulse;
    }
  });

  // 材质
  const branchMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.0,
        clearcoat: 0.04,
        clearcoatRoughness: 0.8,
        emissive: assets.trunkColor,
        emissiveIntensity: 0.18,
      }),
    [assets.trunkColor],
  );

  const rootMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.0,
        emissive: assets.rootColor,
        emissiveIntensity: 0.14,
      }),
    [assets.rootColor],
  );

  const leafMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const flowerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.0,
      }),
    [],
  );

  const fruitMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.08,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
    [],
  );

  const sapMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: assets.sapColor,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.0,
      }),
    [assets.sapColor],
  );

  const innerGlowMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: assets.innerGlowColor,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [assets.innerGlowColor],
  );

  const maxBranchInstances = useMemo(() => {
    let n = 0;
    for (const b of assets.branches) {
      n += b.depth === 0 ? assets.stage.trunkSegs : assets.stage.branchSegs;
    }
    return n;
  }, [assets]);

  const branchGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8, 1), []);
  const rootGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1), []);
  const leafGeometry = useMemo(createLeafGeometry, []);
  const flowerGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.06, 0), []);
  const fruitGeometry = useMemo(() => new THREE.SphereGeometry(0.08, 10, 10), []);
  const sapGeometry = useMemo(() => new THREE.SphereGeometry(0.02, 6, 6), []);

  // 清理材质和几何体，防止内存泄漏
  // 为每个材质/几何体使用独立的清理 effect，只 dispose 真正变化的资源，
  // 避免部分材质变化时 dispose 所有材质（包括未变化的）导致 GPU 资源释放后仍被使用
  useEffect(() => () => void branchMat.dispose(), [branchMat]);
  useEffect(() => () => void rootMat.dispose(), [rootMat]);
  useEffect(() => () => void leafMat.dispose(), [leafMat]);
  useEffect(() => () => void flowerMat.dispose(), [flowerMat]);
  useEffect(() => () => void fruitMat.dispose(), [fruitMat]);
  useEffect(() => () => void sapMat.dispose(), [sapMat]);
  useEffect(() => () => void innerGlowMat.dispose(), [innerGlowMat]);
  useEffect(() => () => void branchGeometry.dispose(), [branchGeometry]);
  useEffect(() => () => void rootGeometry.dispose(), [rootGeometry]);
  useEffect(() => () => void leafGeometry.dispose(), [leafGeometry]);
  useEffect(() => () => void flowerGeometry.dispose(), [flowerGeometry]);
  useEffect(() => () => void fruitGeometry.dispose(), [fruitGeometry]);
  useEffect(() => () => void sapGeometry.dispose(), [sapGeometry]);

  // 家庭成员主枝悬停 hitbox
  const familyBranches = useMemo(() => assets.branches.filter((b) => b.depth === 1), [assets]);

  const handlePointerOver = (member: FamilyMember, mid: THREE.Vector3) => {
    setTooltip({ visible: true, text: member.name, position: mid });
  };

  const handlePointerOut = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const castShadow = perfLevel !== 'low';

  // 缓存灯光 Color 对象，避免每次渲染都创建新实例
  const ambientLightColor = useMemo(() => new THREE.Color(resolveColor('var(--color-light-ambient)')), []);
  const mainLightColor = useMemo(() => new THREE.Color(resolveColor('var(--color-light-main)')), []);
  const rimLightColor = useMemo(() => new THREE.Color(resolveColor('var(--color-light-rim)')), []);
  const roseLightColor = useMemo(() => new THREE.Color(resolveColor('var(--color-rose)')), []);
  const sapLightColor = useMemo(() => new THREE.Color(resolveColor('var(--color-tree-sap)')), []);

  return (
    <>
      <ambientLight intensity={0.62} color={ambientLightColor} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.25}
        color={mainLightColor}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
      />
      {/* 背光/轮廓光：让树在深色玻璃背景中浮现柔和边缘 */}
      <directionalLight
        position={[-3, 2, -4]}
        intensity={0.45}
        color={rimLightColor}
      />
      <pointLight position={[-3, 1.5, -3]} intensity={0.45} color={roseLightColor} />
      <pointLight position={[0, -1.5, 1]} intensity={0.32} color={sapLightColor} />

      <group ref={groupRef} onClick={() => setAutoRotate((v) => !v)}>
        {/* 枝干 */}
        <instancedMesh
          ref={branchMeshRef}
          args={[branchGeometry, branchMat, maxBranchInstances]}
          castShadow={castShadow}
          receiveShadow={castShadow}
        />

        {/* 树根 */}
        <instancedMesh
          ref={rootMeshRef}
          args={[rootGeometry, rootMat, assets.rootSegments.length]}
          receiveShadow={castShadow}
        />

        {/* 树叶 */}
        <instancedMesh
          ref={leafMeshRef}
          args={[leafGeometry, leafMat, assets.leafAnchors.length]}
          castShadow={castShadow}
        />

        {/* 花 */}
        <instancedMesh
          ref={flowerMeshRef}
          args={[flowerGeometry, flowerMat, assets.flowerAnchors.length]}
          castShadow={castShadow}
        />

        {/* 果实 */}
        <instancedMesh
          ref={fruitMeshRef}
          args={[fruitGeometry, fruitMat, assets.fruitAnchors.length]}
          castShadow={castShadow}
        />

        {/* 树液 */}
        <instancedMesh ref={sapMeshRef} args={[sapGeometry, sapMat, assets.sapParticles.length]} />

        {/* 生命节律：树皮内部柔和微光 */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[assets.innerGlowPositions, 3]}
            />
          </bufferGeometry>
          <primitive object={innerGlowMat} attach="material" ref={innerGlowMatRef} />
        </lineSegments>

        {/* 家庭成员主枝悬停命中盒（不可见） */}
        {familyBranches.map((b, i) => {
          const member = family[b.familyIndex % family.length];
          if (!member) return null;
          const mid = b.start.clone().lerp(b.end, 0.5);
          const len = b.start.distanceTo(b.end);
          const dir = b.end.clone().sub(b.start).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, dir);
          const r = Math.max(b.rStart, b.rEnd) * 1.6;
          return (
            <mesh
              key={`${member.id}-${i}`}
              position={mid}
              quaternion={q}
              scale={[r, len, r]}
              onPointerOver={() => handlePointerOver(member, mid)}
              onPointerOut={handlePointerOut}
            >
              <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          );
        })}

        {/* HTML Tooltip */}
        {tooltip.visible && (
          <Html position={tooltip.position} center distanceFactor={8}>
            <div
              style={{
                pointerEvents: 'none',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: 'var(--text-xs)',
                color: 'var(--tooltip-text)',
                background: 'var(--tooltip-bg)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--color-glass-border)',
                whiteSpace: 'nowrap',
                transform: 'translateY(-18px)',
              }}
            >
              {tooltip.text}
            </div>
          </Html>
        )}
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={3}
        maxDistance={12}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI * 0.5}
        enableDamping
        dampingFactor={0.07}
        autoRotate={autoRotate}
        autoRotateSpeed={0.25}
        target={[0, 0.4, 0]}
      />
    </>
  );
}

/* ============================================================================
 * Hooks
 * ========================================================================== */

function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const testCanvas = document.createElement('canvas');
      const gl =
        testCanvas.getContext('webgl2') ||
        testCanvas.getContext('webgl') ||
        testCanvas.getContext('experimental-webgl');
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

type PerformanceLevel = 'high' | 'medium' | 'low';

function usePerformanceLevel(): PerformanceLevel {
  const [level, setLevel] = useState<PerformanceLevel>('medium');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const cores = navigator.hardwareConcurrency ?? 8;
    const mem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) as number;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const smallScreen = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768;
    let score = 0;
    if (cores <= 4) score += 3;
    else if (cores <= 6) score += 2;
    else if (cores <= 8) score += 1;
    if (mem <= 4) score += 3;
    else if (mem <= 8) score += 2;
    if (mobile) score += 3;
    if (smallScreen) score += 1;
    setLevel(score >= 4 ? 'low' : score >= 2 ? 'medium' : 'high');
  }, []);
  return level;
}

function perfMultiplier(level: PerformanceLevel): number {
  if (level === 'low') return 0.45;
  if (level === 'medium') return 0.72;
  return 1.0;
}

/* ============================================================================
 * 主组件
 * ========================================================================== */

export default function LivingTree3D(props: LivingTree3DProps): JSX.Element {
  const {
    growthStage = 'mature',
    familyMembers,
    memoryCount = 0,
    storyCount = memoryCount,
    timeCapsuleCount = 0,
    milestoneCount = 0,
    knowledgeRootCount = memoryCount,
    className,
  } = props;
  const family = familyMembers && familyMembers.length > 0 ? familyMembers : DEFAULT_FAMILY;
  const webglSupported = useWebGLSupport();
  const perfLevel = usePerformanceLevel();
  const multiplier = perfMultiplier(perfLevel);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const familyKey = family.map((f) => `${f.id}:${f.color}`).join('|');
  const assets = useMemo(
    () => generateTree(growthStage, family, multiplier, storyCount, timeCapsuleCount, milestoneCount, knowledgeRootCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [growthStage, familyKey, multiplier, storyCount, timeCapsuleCount, milestoneCount, knowledgeRootCount],
  );

  if (webglSupported === false) {
    return (
      <TreeCanvas2D
        growthStage={growthStage}
        familyMembers={family}
        memoryCount={memoryCount}
        storyCount={storyCount}
        timeCapsuleCount={timeCapsuleCount}
        milestoneCount={milestoneCount}
        knowledgeRootCount={knowledgeRootCount}
        className={className}
      />
    );
  }

  if (webglSupported === null) {
    return (
      <div
        className={`${className} w-full h-full relative bg-transparent`}
      />
    );
  }

  const dprMax = perfLevel === 'low' ? 1 : perfLevel === 'medium' ? 1.25 : 1.5;

  return (
    <div
      className={`${className} w-full h-full relative`}
      role="img"
      aria-label="有机家庭生命树三维可视化：树根代表长期记忆，树干代表成长，枝条代表家庭成员，叶片代表故事，花朵代表里程碑，果实代表时间胶囊"
    >
      <Canvas
        dpr={[1, dprMax]}
        gl={{
          antialias: perfLevel !== 'low',
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.85,
        }}
        camera={{ position: [4.5, 1.8, 5.5], fov: 40, near: 0.1, far: 120 }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <TreeScene
            assets={assets}
            memoryCount={memoryCount}
            storyCount={storyCount}
            timeCapsuleCount={timeCapsuleCount}
            milestoneCount={milestoneCount}
            knowledgeRootCount={knowledgeRootCount}
            family={family}
            perfLevel={perfLevel}
            prefersReducedMotion={prefersReducedMotion}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
