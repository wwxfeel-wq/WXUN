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
import NebulaParticles from '@/components/effects/nebula-particles';
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
      await invokeAgent('life', value);
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="home-cockpit" aria-label="EchoLife 生命空间">
      {/* 星云粒子神经元：铺满整个座舱背景 */}
      <div className="home-cockpit__nebula" aria-hidden="true">
        <NebulaParticles connections />
      </div>

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
            <span>心情指数</span>
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
 * 情绪化心电图 ——
 * 时墨不是机器，它有心情：波形会随情绪呼吸、心率漂移、偶尔来一次心悸/深呼吸。
 *
 * 组成：
 * - 基础 P-QRS-T 心跳
 * - 呼吸调制：整段波形沿基线上下缓慢起伏
 * - HRV 心率变异：心跳间隔不固定，随呼吸周期漂移
 * - 情绪脉冲：每隔一段时间，触发"激动/温柔/惊讶"三种情绪
 *   · 激动：R 峰变高 20%，间隔缩短
 *   · 温柔：整体波幅收窄，间隔加长
 *   · 惊讶：突发一次高 R 峰 + 后续 T 波拉长
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
    const SAMPLES = 300;
    const buffer = new Float32Array(SAMPLES).fill(BASELINE);
    let raf = 0;
    let offset = 0;

    // 情绪状态：0 = 平静, 1 = 激动, 2 = 温柔, 3 = 惊讶
    type Mood = 'calm' | 'excited' | 'tender' | 'startle';
    let currentMood: Mood = 'calm';
    let moodStart = 0;
    let moodDuration = 600; // 帧数

    const rollMood = (): Mood => {
      const r = Math.random();
      if (r < 0.5) return 'calm';
      if (r < 0.75) return 'excited';
      if (r < 0.92) return 'tender';
      return 'startle';
    };

    // 心跳节奏：每次心跳后决定下一次间隔
    let nextBeatOffset = 0;
    let currentBeatInterval = 90;
    let beatCounter = 0;

    /** 根据情绪与呼吸取当前心跳的间隔（像素）与 R 峰高度倍数 */
    const beatParamsForMood = (mood: Mood, breath: number) => {
      // breath ∈ [-1, 1]，代表呼吸周期
      switch (mood) {
        case 'excited':
          return { interval: 70 + breath * 4, rBoost: 1.2 + breath * 0.08, tBoost: 1.0 };
        case 'tender':
          return { interval: 110 + breath * 8, rBoost: 0.78 + breath * 0.05, tBoost: 0.85 };
        case 'startle':
          // 突发一次强 R 后立刻回到平静
          return { interval: 60, rBoost: 1.55, tBoost: 1.4 };
        default:
          return { interval: 90 + breath * 6, rBoost: 1.0 + breath * 0.08, tBoost: 1.0 };
      }
    };

    /**
     * 生成单次心跳采样值。
     * @param t     心跳内偏移
     * @param cfg   本次心跳的振幅参数
     * @param drift 由呼吸造成的整体上下漂移
     */
    const beatSample = (
      t: number,
      cfg: { rBoost: number; tBoost: number },
      drift: number,
    ): number => {
      const B = BASELINE + drift;
      // P 波
      if (t >= 8 && t <= 18) {
        const p = (t - 13) / 5;
        return B - Math.exp(-p * p) * 5 * cfg.tBoost;
      }
      // Q 波
      if (t >= 24 && t < 28) {
        return B + (t - 24) * 2 * cfg.rBoost;
      }
      // R 波
      if (t >= 28 && t < 32) {
        const r = (t - 30) / 1.5;
        return B - Math.exp(-r * r) * 22 * cfg.rBoost;
      }
      // S 波
      if (t >= 32 && t < 37) {
        const s = (t - 34) / 1.8;
        return B + Math.exp(-s * s) * 10 * cfg.rBoost;
      }
      // T 波
      if (t >= 46 && t <= 60) {
        const tt = (t - 53) / 6;
        return B - Math.exp(-tt * tt) * 6 * cfg.tBoost;
      }
      // 微小基线呼吸抖动，模拟真人皮肤电位
      return B + Math.sin(t * 0.35) * 0.35 + (Math.random() - 0.5) * 0.5;
    };

    const buildPath = () => {
      let d = `M0 ${buffer[0].toFixed(2)}`;
      for (let i = 1; i < SAMPLES; i++) {
        d += ` L${i} ${buffer[i].toFixed(2)}`;
      }
      return d;
    };

    // 缓存"当前心跳的 cfg + 起点"
    let activeBeatStart = 0;
    let activeBeatCfg = beatParamsForMood('calm', 0);

    const step = () => {
      // 情绪切换
      if (offset - moodStart > moodDuration) {
        currentMood = rollMood();
        moodStart = offset;
        // 激动/温柔持续 6-10 秒，惊讶只 1 秒
        moodDuration =
          currentMood === 'startle'
            ? 60
            : 360 + Math.floor(Math.random() * 240);
      }

      // 呼吸周期：约 4 秒（240 帧）
      const breath = Math.sin((offset / 240) * Math.PI * 2);
      const drift = breath * 1.6;

      // 触发下一次心跳
      if (offset >= nextBeatOffset) {
        activeBeatCfg = beatParamsForMood(currentMood, breath);
        currentBeatInterval = activeBeatCfg.interval;
        activeBeatStart = offset;
        nextBeatOffset = offset + Math.round(currentBeatInterval);
        beatCounter++;
      }

      // 缓冲区左移
      for (let i = 0; i < SAMPLES - 1; i++) {
        buffer[i] = buffer[i + 1];
      }
      const beatT = offset - activeBeatStart;
      buffer[SAMPLES - 1] = beatSample(beatT, activeBeatCfg, drift);
      offset++;

      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPath());
      }
      raf = requestAnimationFrame(step);
    };

    // 预填充历史：用平静心跳预热
    let prefillOffset = 0;
    let prefillBeatStart = 0;
    let prefillCfg = beatParamsForMood('calm', 0);
    for (let i = 0; i < SAMPLES; i++) {
      if (prefillOffset - prefillBeatStart >= currentBeatInterval) {
        const breath = Math.sin((prefillOffset / 240) * Math.PI * 2);
        prefillCfg = beatParamsForMood('calm', breath);
        currentBeatInterval = prefillCfg.interval;
        prefillBeatStart = prefillOffset;
      }
      const breath = Math.sin((prefillOffset / 240) * Math.PI * 2);
      buffer[i] = beatSample(prefillOffset - prefillBeatStart, prefillCfg, breath * 1.6);
      prefillOffset++;
    }
    offset = prefillOffset;
    activeBeatStart = prefillBeatStart;
    activeBeatCfg = prefillCfg;
    nextBeatOffset = prefillBeatStart + Math.round(currentBeatInterval);
    raf = requestAnimationFrame(step);

    // 避免未使用变量告警
    void HEIGHT;
    void beatCounter;

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
