'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { TreePine, Sprout, Flower, Apple, Sparkles } from 'lucide-react';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import LivingTree3D, { type GrowthStage } from '@/components/tree/living-tree-3d';
import NebulaParticles from '@/components/effects/nebula-particles';
import { AnimatedNumber } from '@/components/home/animated-number';
import { GlassLayer } from '@/components/glass';

const treeElements = [
  { icon: Sprout, label: '树叶', key: 'leaves', color: 'var(--color-success)' },
  { icon: Apple, label: '果实', key: 'fruit', color: 'var(--color-highlight)' },
  { icon: TreePine, label: '树根', key: 'roots', color: 'var(--color-secondary)' },
  { icon: Flower, label: '主枝', key: 'branches', color: 'var(--color-purple)' },
];

const growthStages = ['Seed', 'Sprout', 'Young', 'Mature', 'Bloom', 'Fruit', 'Eternal'];

const stageKeywords: Record<string, GrowthStage> = {
  seed: 'seed',
  sprout: 'sprout',
  young: 'young',
  mature: 'mature',
  bloom: 'bloom',
  fruit: 'fruit',
  eternal: 'eternal',
};

function parseGrowthStage(stage: string): GrowthStage {
  const key = stage.toLowerCase().replace(/\s+/g, '').replace(/tree/g, '');
  return stageKeywords[key] ?? 'young';
}

function buildFamilyMembers(count: number) {
  const palette = [
    { id: 'father', name: '爸爸', color: 'var(--color-family-father)' },
    { id: 'mother', name: '妈妈', color: 'var(--color-family-mother)' },
    { id: 'child', name: '孩子', color: 'var(--color-family-child)' },
    { id: 'elder', name: '老人', color: 'var(--color-family-elder)' },
    { id: 'pet', name: '宠物', color: 'var(--color-family-pet)' },
  ];
  const members = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    const template = palette[i % palette.length];
    members.push({ ...template, id: `${template.id}-${i}` });
  }
  return members;
}

/**
 * 生命树区域
 *
 * 移除 ECG 心电监护等医疗/科技元素，
 * 突出「树根=记忆、树干=成长、枝干=家人、叶=故事、花=里程碑、果实=时间胶囊」的隐喻。
 */
export function LifeTreeSection() {
  const metrics = useFamilyHubStore((s) => s.metrics);
  const currentStage = metrics.treeStage;
  const growth = metrics.treeGrowth;
  const growthStage = parseGrowthStage(currentStage);
  const stageIdx = Math.min(
    6,
    Math.max(0, growthStages.indexOf(growthStage.replace(/^\w/, (c) => c.toUpperCase()))),
  );
  const shouldReduceMotion = useReducedMotion();
  const motionProps = shouldReduceMotion
    ? { initial: false, animate: false }
    : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      {...motionProps}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">
          我们的生命树
        </h2>
        <p className="text-xs text-text-subtle mt-1">
          记忆作根，成长作干，家人作枝，故事作叶
        </p>
      </div>

      {/* Tree Canvas —— 外层 isolate 创建独立层叠上下文，防止 z-background 跑到页面背景后 */}
      <div className="relative isolate">
        {/* ===== 层 -3：底部氛围星云粒子（树后，大颗柔光） ===== */}
        {/* 放在 GlassLayer 外部，避免被玻璃背景色冲淡；isolate 保证它在当前卡片内可见 */}
        <div
          className="absolute inset-0 pointer-events-none rounded-3xl overflow-hidden"
          aria-hidden="true"
          style={{ mixBlendMode: 'screen', zIndex: 'var(--z-background)' }}
        >
          <NebulaParticles
            connections={false}
            density={60}
          />
        </div>

        <GlassLayer
          intensity="strong"
          className="relative z-[var(--z-base)] overflow-hidden rounded-3xl h-56vh min-h-110"
        >
          {/* ===== 层 -2：底部神经脉络 SVG 纹理 ===== */}
          <NeuralRootSVG />

          {/* ===== 层 -1：3D Living Tree（主体） ===== */}
          <div className="absolute inset-0" aria-hidden="true">
            <LivingTree3D
              growthStage={growthStage}
              memoryCount={metrics.longTermMemories}
              storyCount={metrics.stories}
              timeCapsuleCount={metrics.timeCapsules}
              milestoneCount={metrics.milestones}
              knowledgeRootCount={metrics.longTermMemories + metrics.knowledgeDocs}
              familyMembers={buildFamilyMembers(metrics.familyMembers)}
            />
          </div>

          {/* ===== 层 +1：前景星云粒子流（树前，细丝连线） ===== */}
          <div
            className="absolute inset-0 pointer-events-none z-local-above"
            aria-hidden="true"
            style={{ mixBlendMode: 'screen' }}
          >
            <NebulaParticles
              connections
              density={80}
            />
          </div>

          {/* 成长阶段 — 右上角（极简） */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="absolute top-4 right-4"
            {...motionProps}
          >
            <GlassLayer intensity="subtle" className="px-3 py-2 flex items-center gap-1.5">
              {growthStages.map((stage, i) => (
                <div
                  key={stage}
                  role="img"
                  aria-label={`${stage} 阶段${i <= stageIdx ? ' 已达成' : ' 未达成'}`}
                  className={`rounded-full transition-[width,height,background-color,box-shadow] duration-300 ${
                    i === stageIdx ? 'w-1.5 h-1.5' : 'w-1 h-1'
                  }`}
                  style={{
                    backgroundColor:
                      i <= stageIdx ? 'var(--color-success)' : 'var(--color-gray-800)',
                    boxShadow:
                      i === stageIdx ? 'var(--shadow-glow-primary-sm)' : 'none',
                  }}
                  title={stage}
                />
              ))}
            </GlassLayer>
          </motion.div>

          {/* 树语提示 — 左上角 */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="absolute top-4 left-4 hidden sm:block"
            {...motionProps}
          >
            <GlassLayer intensity="subtle" className="px-3 py-2 max-w-55">
              <div className="flex items-center gap-2">
                <Sparkles
                  size={12}
                  className="text-success shrink-0"
                  aria-hidden="true"
                />
                <span className="text-2xs text-text-muted leading-snug">
                  这棵树随着家的记忆一起生长
                </span>
              </div>
            </GlassLayer>
          </motion.div>

          {/* 底部指标 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2"
            {...motionProps}
          >
            <GlassLayer
              intensity="strong"
              className="px-5 py-2.5 flex items-center gap-4 rounded-2xl"
            >
              <CompactMetric
                label="成长"
                value={
                  <>
                    <AnimatedNumber value={Math.round(growth * 100)} suffix="%" />
                  </>
                }
              />
              <Sep />
              <CompactMetric
                label="记忆"
                value={<AnimatedNumber value={metrics.longTermMemories} />}
              />
              <Sep />
              <CompactMetric label="家人" value={metrics.familyMembers} />
              <Sep />
              <CompactMetric label="能力" value={metrics.masteredSkills} />
            </GlassLayer>
          </motion.div>
        </GlassLayer>
      </div>

      {/* 元素详情 */}
      <div className="grid grid-cols-4 gap-2.5 mt-4">
        {treeElements.map((el, index) => {
          const value =
            el.key === 'leaves'
              ? metrics.stories
              : el.key === 'roots'
                ? metrics.longTermMemories + metrics.knowledgeDocs
                : el.key === 'fruit'
                  ? metrics.timeCapsules
                  : metrics.familyMembers;
          return (
            <motion.div
              key={el.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + index * 0.04, duration: 0.3 }}
              {...motionProps}
            >
              <GlassLayer
                intensity="subtle"
                className="px-3 py-2.5 flex items-center gap-2 cursor-default rounded-xl"
                caustic={false}
                shadow={false}
              >
                <el.icon
                  size={14}
                  style={{ color: el.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-3xs text-text-subtle truncate">
                    {el.label}
                  </div>
                  <div className="text-xs text-text font-medium tabular-nums">
                    <AnimatedNumber value={value} />
                  </div>
                </div>
              </GlassLayer>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

/** 底部神经脉络 SVG —— 复刻旧版登录页底部的柔和神经网格 */
function NeuralRootSVG() {
  return (
    <svg
      className="pointer-events-none absolute left-0 bottom-0 w-full h-45p z-[var(--z-base)]"
      aria-hidden="true"
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMax slice"
      style={{
        maskImage:
          'linear-gradient(to top, var(--color-mask-strong) 0%, var(--color-mask-medium) 30%, var(--color-mask-transparent) 100%)',
        WebkitMaskImage:
          'linear-gradient(to top, var(--color-mask-strong) 0%, var(--color-mask-medium) 30%, var(--color-mask-transparent) 100%)',
      }}
    >
      <defs>
        <linearGradient id="neuralGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="neuralGlow">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 柔和渐变底 */}
      <ellipse cx="600" cy="420" rx="700" ry="220" fill="url(#neuralGlow)" />

      {/* 神经连线 */}
      <g
        fill="none"
        stroke="url(#neuralGrad)"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.45"
      >
        <path d="M0,400 Q150,300 300,320 T600,280 T900,300 T1200,260" />
        <path d="M0,400 Q200,330 400,350 T800,310 T1200,330" />
        <path d="M0,400 Q120,360 260,370 Q420,380 560,350 Q720,320 880,340 Q1040,360 1200,340" />
        <path d="M100,400 Q280,310 460,340 Q640,370 820,300 Q1000,320 1100,280" />
        <path d="M-50,380 Q200,280 450,310 Q700,260 950,290 Q1200,250 1250,270" />
      </g>

      {/* 神经节点 */}
      <g fill="var(--color-primary)" opacity="0.5">
        <circle cx="180" cy="330" r="1.6" />
        <circle cx="240" cy="300" r="1.2" />
        <circle cx="380" cy="340" r="1.6" />
        <circle cx="460" cy="300" r="1.2" />
        <circle cx="600" cy="350" r="1.6" />
        <circle cx="680" cy="320" r="1.2" />
        <circle cx="820" cy="345" r="1.6" />
        <circle cx="900" cy="310" r="1.2" />
        <circle cx="1040" cy="350" r="1.6" />
        <circle cx="1120" cy="320" r="1.2" />
        <circle cx="300" cy="320" r="1.0" />
        <circle cx="500" cy="310" r="1.4" />
        <circle cx="750" cy="330" r="1.0" />
        <circle cx="950" cy="340" r="1.4" />
      </g>
    </svg>
  );
}

function CompactMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center min-w-11">
      <div className="text-4xs text-text-subtle leading-none mb-0.5">{label}</div>
      <div className="text-xs font-medium text-text tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );
}

function Sep() {
  return <div className="h-5 w-px bg-[var(--color-gray-800)]" />;
}

export default LifeTreeSection;
