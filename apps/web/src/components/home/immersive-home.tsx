'use client';

import { FormEvent, useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowUp,
  BookOpen,
  BrainCircuit,
  CircleDot,
  HeartPulse,
  Leaf,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Sprout,
  TreePine,
} from 'lucide-react';
import LivingTree3D, { type GrowthStage } from '@/components/tree/living-tree-3d';
import { GlassLayer } from '@/components/glass';
import { useFamilyHubStore, type TimelineEntry } from '@/stores/family-hub-store';

const stageMap: Record<string, GrowthStage> = {
  seed: 'seed',
  sprout: 'sprout',
  young: 'young',
  mature: 'mature',
  bloom: 'bloom',
  fruit: 'fruit',
  eternal: 'eternal',
};

const familyPalette = [
  ['father', '爸爸', 'var(--color-family-father)'],
  ['mother', '妈妈', 'var(--color-family-mother)'],
  ['child', '孩子', 'var(--color-family-child)'],
  ['elder', '老人', 'var(--color-family-elder)'],
  ['pet', '宠物', 'var(--color-family-pet)'],
] as const;

function parseStage(value: string): GrowthStage {
  const key = value.toLowerCase().replace(/tree|\s+/g, '');
  return stageMap[key] ?? 'young';
}

function timelineIcon(type: TimelineEntry['type']) {
  if (type === 'memory') return BookOpen;
  if (type === 'tree') return TreePine;
  if (type === 'skill') return Sparkles;
  return CircleDot;
}

export function ImmersiveHome() {
  const metrics = useFamilyHubStore((state) => state.metrics);
  const shimoCore = useFamilyHubStore((state) => state.shimoCore);
  const skills = useFamilyHubStore((state) => state.skills);
  const timeline = useFamilyHubStore((state) => state.timeline);
  const invokeAgent = useFamilyHubStore((state) => state.invokeAgent);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const reduceMotion = useReducedMotion();
  const familyMembers = Array.from({ length: Math.max(1, metrics.familyMembers) }, (_, index) => {
    const [id, name, color] = familyPalette[index % familyPalette.length];
    return { id: `${id}-${index}`, name, color };
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await invokeAgent('life_coach', value);
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="home-cockpit" aria-label="EchoLife 生命空间">
      <div className="home-cockpit__tree" aria-hidden="true">
        <LivingTree3D
          growthStage={parseStage(metrics.treeStage)}
          memoryCount={metrics.longTermMemories}
          storyCount={metrics.stories}
          timeCapsuleCount={metrics.timeCapsules}
          milestoneCount={metrics.milestones}
          knowledgeRootCount={metrics.longTermMemories + metrics.knowledgeDocs}
          familyMembers={familyMembers}
        />
      </div>
      <div className="home-cockpit__vignette" aria-hidden="true" />

      <motion.header
        className="home-cockpit__brand"
        initial={reduceMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="home-cockpit__mark"><Leaf size={18} /></span>
        <span><strong>EchoLife</strong><small>DIGITAL LIFE OS</small></span>
      </motion.header>

      <div className="home-cockpit__status">
        <span className="home-cockpit__pulse" />
        时墨在线
      </div>

      <aside className="home-cockpit__left" aria-label="运行与成长状态">
        <GlassLayer intensity="strong" className="home-panel home-panel--monitor">
          <div className="home-panel__title"><span><Activity size={14} /> 时墨</span><span className="home-panel__online">在线</span></div>
          <div className="home-monitor">
            <span>意识活跃度</span>
            <strong>{shimoCore.understanding}</strong><small>%</small>
            <svg viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">
              <ECGPath />
            </svg>
          </div>
          <div className="home-panel__stats">
            <Metric label="理解度" value={`${metrics.understandingPercent}%`} />
            <Metric label="等级" value={`Lv.${metrics.aiLevel}`} />
            <Metric label="Agent" value={metrics.activeAgents} />
            <Metric label="学习" value={metrics.newAbilities} />
          </div>
        </GlassLayer>

        <GlassLayer intensity="strong" className="home-panel home-panel--growth">
          <div className="home-panel__title"><span><Sprout size={14} /> 认知深度</span><strong>{metrics.understandingPercent}%</strong></div>
          <div className="home-progress"><i style={{ width: `${metrics.understandingPercent}%` }} /></div>
          <div className="home-growth-values">
            <Metric label="LEVEL" value={`Lv.${metrics.treeLevel}`} />
            <Metric label="MEMORY" value={metrics.longTermMemories} />
          </div>
        </GlassLayer>
      </aside>

      <aside className="home-cockpit__right" aria-label="能力与近期动态">
        <GlassLayer intensity="strong" className="home-panel home-panel--skills">
          <div className="home-panel__title"><span><BrainCircuit size={14} /> 掌握能力</span><small>{metrics.masteredSkills} 项</small></div>
          <div className="home-list">
            {skills.slice(0, 5).map((skill, index) => {
              const icons = [Sprout, ShieldCheck, TreePine, HeartPulse, MessageCircle];
              const Icon = icons[index % icons.length];
              return <div className="home-list__row" key={skill.id}><Icon size={15} style={{ color: skill.color }} /><span>{skill.name}</span><small>Lv.{skill.level}</small></div>;
            })}
          </div>
        </GlassLayer>

        <GlassLayer intensity="strong" className="home-panel home-panel--timeline">
          <div className="home-panel__title"><span><Activity size={14} /> 近期动态</span></div>
          <div className="home-list">
            {timeline.slice(0, 3).map((item) => {
              const Icon = timelineIcon(item.type);
              return <div className="home-list__row home-list__row--timeline" key={item.id}><Icon size={14} /><span>{item.title}<small>{item.detail}</small></span></div>;
            })}
          </div>
        </GlassLayer>
      </aside>

      <GlassLayer intensity="strong" className="home-cockpit__core">
        <span>认知核心</span>
        <Metric label="认知" value={`${metrics.understandingPercent}%`} />
        <Metric label="技能" value={metrics.masteredSkills} />
        <Metric label="成员" value={metrics.familyMembers} />
      </GlassLayer>

      <form className="home-cockpit__input" onSubmit={submit}>
        <GlassLayer intensity="strong" className="home-input-shell">
          <MessageCircle size={16} aria-hidden="true" />
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="和时墨聊聊..." aria-label="和时墨对话" />
          <button type="submit" disabled={!message.trim() || sending} aria-label="发送消息"><ArrowUp size={17} /></button>
        </GlassLayer>
      </form>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="home-metric"><small>{label}</small><strong>{value}</strong></div>;
}

/**
 * 真实心电图波形（P-QRS-T）——
 * 用 requestAnimationFrame 实时推进采样，模拟真实心跳滚动波形。
 * 采用生理学的经典 ECG 波形：P波（心房去极化）+ QRS 复合波 + T波（心室复极化）。
 */
function ECGPath() {
  const pathRef = useRef<SVGPathElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      if (pathRef.current) {
        pathRef.current.setAttribute('d', staticECGPath());
      }
      return;
    }

    const HEIGHT = 48;
    const BASELINE = HEIGHT / 2;
    const SAMPLES = 300; // 一像素一个采样
    const BEAT_INTERVAL = 90; // 每 90 像素一次心跳
    const buffer = new Float32Array(SAMPLES).fill(BASELINE);
    let raf = 0;
    let offset = 0;

    /**
     * 生成单次心跳采样值。t ∈ [0, BEAT_INTERVAL)
     * 波形依次：基线 → P 波 → PR 间期 → QRS → ST → T 波 → 基线
     */
    const beatSample = (t: number): number => {
      // P 波（小凸起，向下即上）
      if (t >= 8 && t <= 18) {
        const p = (t - 13) / 5;
        return BASELINE - Math.exp(-p * p) * 5;
      }
      // Q 波（小下探）
      if (t >= 24 && t < 28) {
        return BASELINE + (t - 24) * 2;
      }
      // R 波（尖峰向上）
      if (t >= 28 && t < 32) {
        const r = (t - 30) / 1.5;
        return BASELINE - Math.exp(-r * r) * 22;
      }
      // S 波（尖峰向下）
      if (t >= 32 && t < 37) {
        const s = (t - 34) / 1.8;
        return BASELINE + Math.exp(-s * s) * 10;
      }
      // T 波（缓和凸起）
      if (t >= 46 && t <= 60) {
        const tt = (t - 53) / 6;
        return BASELINE - Math.exp(-tt * tt) * 6;
      }
      return BASELINE;
    };

    const buildPath = () => {
      let d = `M0 ${buffer[0].toFixed(2)}`;
      for (let i = 1; i < SAMPLES; i++) {
        d += ` L${i} ${buffer[i].toFixed(2)}`;
      }
      return d;
    };

    const step = () => {
      // 缓存滚动：向左移一格，新样本从右边推入
      for (let i = 0; i < SAMPLES - 1; i++) {
        buffer[i] = buffer[i + 1];
      }
      const beatT = offset % BEAT_INTERVAL;
      buffer[SAMPLES - 1] = beatSample(beatT);
      offset++;

      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPath());
      }
      raf = requestAnimationFrame(step);
    };

    // 预填充历史
    for (let i = 0; i < SAMPLES; i++) {
      buffer[i] = beatSample(i % BEAT_INTERVAL);
    }
    offset = SAMPLES;
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return <path ref={pathRef} d={staticECGPath()} />;
}

function staticECGPath(): string {
  const parts: string[] = ['M0 24'];
  for (let x = 0; x <= 300; x++) {
    const t = x % 90;
    let y = 24;
    if (t >= 8 && t <= 18) {
      const p = (t - 13) / 5;
      y = 24 - Math.exp(-p * p) * 5;
    } else if (t >= 24 && t < 28) {
      y = 24 + (t - 24) * 2;
    } else if (t >= 28 && t < 32) {
      const r = (t - 30) / 1.5;
      y = 24 - Math.exp(-r * r) * 22;
    } else if (t >= 32 && t < 37) {
      const s = (t - 34) / 1.8;
      y = 24 + Math.exp(-s * s) * 10;
    } else if (t >= 46 && t <= 60) {
      const tt = (t - 53) / 6;
      y = 24 - Math.exp(-tt * tt) * 6;
    }
    parts.push(`L${x} ${y.toFixed(2)}`);
  }
  return parts.join(' ');
}
