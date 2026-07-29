'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Check, Circle } from 'lucide-react';
import { useFamilyHubStore, type SkillProgress } from '@/stores/family-hub-store';
import type { SkillAbility } from '@echolife/shared';
import { getIcon } from '@/components/home/icon-map';
import { AnimatedNumber } from '@/components/home/animated-number';
import { SkillDetailModal } from '@/components/home/skill-detail-modal';
import { GlassCard } from '@/components/glass';

/* ═══════════════ Data Model ═══════════════ */

export type LiveStatus = 'working' | 'scanning' | 'waiting' | 'analyzing' | 'idle';

export interface LiveSkill {
  id: string;
  name: string;
  purpose: string;
  icon: string;
  color: string;
  status: LiveStatus;
  currentTask: string;
  level: number;
  progress: number;
  abilities: SkillAbility[];
  linkedAgents: string[];
}

interface LiveStatusMeta {
  label: string;
  color: string;
  pulse: boolean;
}

const LIVE_STATUS_META: Record<LiveStatus, LiveStatusMeta> = {
  working: { label: '正在用', color: 'var(--color-success)', pulse: true },
  analyzing: { label: '在成长', color: 'var(--color-primary)', pulse: true },
  scanning: { label: '在学习', color: 'var(--color-highlight)', pulse: false },
  waiting: { label: '在待命', color: 'var(--color-apple-gray)', pulse: false },
  idle: { label: '在休息', color: 'var(--color-apple-dark-gray)', pulse: false },
};

const LIVE_SKILLS: LiveSkill[] = [
  {
    id: 'memory-organizer',
    name: '家庭收纳',
    purpose: '整理聊天和回忆，让家的点滴都有归属',
    icon: 'Archive',
    color: 'var(--color-success)',
    status: 'working',
    currentTask: '正在整理今天的小事…',
    level: 4,
    progress: 67,
    abilities: [
      { name: '聊天整理', level: 1, unlocked: true, description: '从对话中提取关键信息' },
      { name: '自动分类', level: 2, unlocked: true, description: '按主题自动归类记忆' },
      { name: '人物画像', level: 3, unlocked: true, description: '建立家庭成员画像' },
      { name: '长期记忆', level: 4, unlocked: true, description: '生成长期记忆链' },
      { name: '规律发现', level: 5, unlocked: false, description: '主动发现家庭规律' },
    ],
    linkedAgents: ['memory-gardener', 'knowledge-root'],
  },
  {
    id: 'relationship-observer',
    name: '关系观察',
    purpose: '发现家人之间的亲密度变化',
    icon: 'Users',
    color: 'var(--color-primary)',
    status: 'analyzing',
    currentTask: '发现这周家人互动更多了',
    level: 3,
    progress: 45,
    abilities: [
      { name: '互动检测', level: 1, unlocked: true, description: '识别家庭成员互动频率' },
      { name: '亲密度分析', level: 2, unlocked: true, description: '计算亲密度变化趋势' },
      { name: '关系图谱', level: 3, unlocked: true, description: '可视化家庭关系网络' },
      { name: '预警系统', level: 4, unlocked: false, description: '关系异常主动预警' },
      { name: '深度建议', level: 5, unlocked: false, description: '生成关系改善建议' },
    ],
    linkedAgents: ['relationship-observer'],
  },
  {
    id: 'story-weaver',
    name: '故事编织',
    purpose: '把家庭记忆变成温暖的故事',
    icon: 'BookOpen',
    color: 'var(--color-highlight)',
    status: 'waiting',
    currentTask: '等待新的家庭事件…',
    level: 2,
    progress: 30,
    abilities: [
      { name: '事件提取', level: 1, unlocked: true, description: '从记忆中提取关键事件' },
      { name: '故事生成', level: 2, unlocked: true, description: '自动编写家庭故事' },
      { name: '时间轴', level: 3, unlocked: false, description: '生成长期时间轴' },
      { name: '年度回忆', level: 4, unlocked: false, description: '编译年度回忆录' },
      { name: '叙事风格', level: 5, unlocked: false, description: '学习家庭叙事风格' },
    ],
    linkedAgents: ['story-weaver'],
  },
  {
    id: 'emotion-guardian',
    name: '情绪观察',
    purpose: '感知家人情绪，主动温柔提醒',
    icon: 'Heart',
    color: 'var(--color-rose)',
    status: 'analyzing',
    currentTask: '妈妈今天需要多一点陪伴',
    level: 3,
    progress: 52,
    abilities: [
      { name: '情绪识别', level: 1, unlocked: true, description: '从文字分析情绪状态' },
      { name: '趋势分析', level: 2, unlocked: true, description: '追踪情绪变化趋势' },
      { name: '主动提醒', level: 3, unlocked: true, description: '异常情绪主动通知' },
      { name: '情绪地图', level: 4, unlocked: false, description: '家庭整体情绪可视化' },
      { name: '关怀建议', level: 5, unlocked: false, description: '生成个性化关怀方案' },
    ],
    linkedAgents: ['emotion-guardian'],
  },
  {
    id: 'time-capsule',
    name: '时间胶囊',
    purpose: '封存重要时刻，未来一起开启',
    icon: 'Gift',
    color: 'var(--color-orange)',
    status: 'idle',
    currentTask: '等待重要时刻…',
    level: 1,
    progress: 15,
    abilities: [
      { name: '时刻识别', level: 1, unlocked: true, description: '识别值得保存的时刻' },
      { name: '自动封装', level: 2, unlocked: false, description: '自动创建时间胶囊' },
      { name: '定期开启', level: 3, unlocked: false, description: '设置开启时间' },
      { name: '家庭共享', level: 4, unlocked: false, description: '家庭成员共同参与' },
      { name: '回忆触发', level: 5, unlocked: false, description: '智能触发回忆时刻' },
    ],
    linkedAgents: ['memory-gardener'],
  },
  {
    id: 'knowledge-root',
    name: '知识根系',
    purpose: '建立属于这个家的知识网络',
    icon: 'Network',
    color: 'var(--color-secondary)',
    status: 'working',
    currentTask: '把新学会的菜谱放进知识库',
    level: 3,
    progress: 78,
    abilities: [
      { name: '实体提取', level: 1, unlocked: true, description: '识别记忆中的实体' },
      { name: '关系建立', level: 2, unlocked: true, description: '建立实体间关系' },
      { name: '知识图谱', level: 3, unlocked: true, description: '构建可视化知识网络' },
      { name: '画像深化', level: 4, unlocked: false, description: '深化人物画像维度' },
      { name: '智能推理', level: 5, unlocked: false, description: '基于知识图谱推理' },
    ],
    linkedAgents: ['knowledge-root', 'memory-gardener'],
  },
];

const SKILL_ABILITY_TOOL_MAP: Record<string, Record<string, { toolName: string; parameters?: Record<string, unknown> }>> = {
  '家庭收纳': {
    '聊天整理': { toolName: 'create_memory', parameters: { title: '收纳整理笔记', type: 'daily' } },
    '自动分类': { toolName: 'search_memories', parameters: { query: '收纳 整理 分类' } },
    '人物画像': { toolName: 'upsert_entity', parameters: { type: 'person', description: '家庭成员画像' } },
    '长期记忆': { toolName: 'create_memory', parameters: { title: '长期家庭记忆', type: 'story' } },
    '规律发现': { toolName: 'search_memories', parameters: { query: '家庭 规律' } },
  },
  '关系观察': {
    '互动检测': { toolName: 'search_memories', parameters: { query: '家人 互动 聊天' } },
    '亲密度分析': { toolName: 'search_knowledge', parameters: { term: '亲密关系 家庭' } },
    '关系图谱': { toolName: 'upsert_entity', parameters: { type: 'person', description: '家庭成员' } },
    '预警系统': { toolName: 'send_family_notification', parameters: { title: '关系观察提醒', body: '最近家人互动较少，记得联系一下。' } },
    '深度建议': { toolName: 'create_reminder', parameters: { content: '安排一次家庭互动' } },
  },
  '故事编织': {
    '事件提取': { toolName: 'search_memories', parameters: { query: '家庭 故事 事件' } },
    '故事生成': { toolName: 'create_memory', parameters: { title: '家庭故事', type: 'story' } },
    '时间轴': { toolName: 'search_memories', parameters: { query: '时间轴 重要时刻' } },
    '年度回忆': { toolName: 'search_memories', parameters: { query: '2024 年度 回忆' } },
    '叙事风格': { toolName: 'create_memory', parameters: { title: '叙事风格笔记', type: 'reflection' } },
  },
  '情绪观察': {
    '情绪识别': { toolName: 'create_memory', parameters: { title: '情绪观察', type: 'emotion' } },
    '趋势分析': { toolName: 'search_memories', parameters: { query: '情绪 心情 变化', type: 'emotion' } },
    '主动提醒': { toolName: 'send_family_notification', parameters: { title: '情绪关怀提醒', body: '今天记得关心一下家人的情绪状态。' } },
    '情绪地图': { toolName: 'upsert_entity', parameters: { type: 'concept', description: '家庭情绪地图' } },
    '关怀建议': { toolName: 'create_reminder', parameters: { content: '给家人一个温暖的问候' } },
  },
  '时间胶囊': {
    '时刻识别': { toolName: 'create_memory', parameters: { title: '值得封存的时刻', type: 'event' } },
    '自动封装': { toolName: 'create_memory', parameters: { title: '时间胶囊', type: 'story' } },
    '定期开启': { toolName: 'create_reminder', parameters: { content: '开启时间胶囊' } },
    '家庭共享': { toolName: 'send_family_notification', parameters: { title: '时间胶囊共享', body: '一起打开这段封存的家庭记忆。', notifyFamilyMembers: true } },
    '回忆触发': { toolName: 'search_memories', parameters: { query: '回忆 重要时刻' } },
  },
  '知识根系': {
    '实体提取': { toolName: 'upsert_entity', parameters: { type: 'concept', description: '从记忆中提取的知识实体' } },
    '关系建立': { toolName: 'upsert_entity', parameters: { type: 'person', description: '建立关系的家庭成员' } },
    '知识图谱': { toolName: 'search_knowledge', parameters: { term: '家庭知识' } },
    '画像深化': { toolName: 'upsert_entity', parameters: { type: 'person', description: '深化家庭成员画像' } },
    '智能推理': { toolName: 'search_knowledge', parameters: { term: '家庭 推理' } },
  },
};

function getAbilityTool(skillName: string, abilityName: string): { toolName: string; parameters?: Record<string, unknown> } | undefined {
  return SKILL_ABILITY_TOOL_MAP[skillName]?.[abilityName];
}

function toSkillProgress(skill: LiveSkill): SkillProgress {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.purpose,
    level: skill.level,
    status: skill.progress >= 100 ? 'mastered' : 'learning',
    progress: skill.progress,
    sourceAgent: skill.linkedAgents[0]
      ? `${skill.linkedAgents[0].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`
      : '独立运行',
    icon: skill.icon,
    color: skill.color,
    abilities: skill.abilities.map((ability) => {
      const tool = getAbilityTool(skill.name, ability.name);
      return {
        ...ability,
        toolName: tool?.toolName,
        parameters: tool?.parameters,
      };
    }),
  };
}

/**
 * 能力成长
 *
 * 把「AI 长期能力」改为更家庭化的「能力成长」。
 * 突出「时墨正在学什么、能为家做什么」，弱化运行次数等技术指标。
 */
export function SkillsSection() {
  const storeSkills = useFamilyHubStore((s) => s.skills);
  const [liveSkills, setLiveSkills] = React.useState<LiveSkill[]>(LIVE_SKILLS);
  const [selected, setSelected] = React.useState<LiveSkill | null>(null);

  React.useEffect(() => {
    const byName = new Map(storeSkills.map((s) => [s.name, s]));
    setLiveSkills((prev) =>
      prev.map((ls) => {
        const match = byName.get(ls.name);
        if (!match) return ls;
        return {
          ...ls,
          level: match.level ?? ls.level,
          progress: typeof match.progress === 'number' ? match.progress : ls.progress,
        };
      }),
    );
  }, [storeSkills]);

  const activeCount = liveSkills.filter((s) => s.status === 'working' || s.status === 'analyzing').length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">能力在成长</h2>
        <p className="text-xs text-text-subtle mt-1">
          {activeCount > 0 ? `有 ${activeCount} 项能力正在为这个家长进` : '时墨的能力在安静成长'}
        </p>
      </div>

      {/* Cards: mobile horizontal carousel, md+ 2-column grid */}
      <motion.div
        className="flex md:grid md:grid-cols-2 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-2 md:pb-0 md:snap-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        {liveSkills.map((skill) => (
          <LiveSkillCard key={skill.id} skill={skill} onSelect={() => setSelected(skill)} />
        ))}
      </motion.div>

      {/* View all */}
      <div className="mt-5 flex justify-center">
        <Link
          href="/skills"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors focus:outline-none focus-ring rounded-lg px-2 py-1"
        >
          查看全部能力
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <SkillDetailModal
        skill={selected ? toSkillProgress(selected) : null}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </motion.section>
  );
}

function LiveSkillCard({ skill, onSelect }: { skill: LiveSkill; onSelect: () => void }) {
  const meta = LIVE_STATUS_META[skill.status];
  const Icon = getIcon(skill.icon);

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
      }}
      className="min-w-85p md:min-w-0 snap-center md:snap-normal shrink-0 md:shrink h-full"
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left"
      >
        <GlassCard
          hoverable
          className="p-4 md:p-5 h-full cursor-pointer relative overflow-hidden"
          caustic={false}
          shadow={false}
          style={{ borderColor: `color-mix(in srgb, ${skill.color} 12%, transparent)` }}
        >
          {/* Header */}
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  color: skill.color,
                  border: `1px solid color-mix(in srgb, ${skill.color} 18%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${skill.color} 7%, transparent)`,
                }}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text truncate">{skill.name}</p>
                <p className="text-3xs text-text-subtle truncate">{skill.purpose}</p>
              </div>
            </div>
            <StatusBadge meta={meta} />
          </div>

          {/* Current task */}
          <div
            className="relative mt-3 rounded-2xl px-3 py-2.5"
            style={{ backgroundColor: `color-mix(in srgb, ${skill.color} 6%, transparent)` }}
          >
            <p className="text-xs font-medium text-text leading-relaxed">{skill.currentTask}</p>
          </div>

          {/* Level + progress */}
          <div className="relative mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-2xs font-medium text-text-muted">Lv.{skill.level}</span>
              <span className="text-2xs text-text-subtle">
                成长值 <span className="text-text-muted font-medium"><AnimatedNumber value={skill.progress} suffix="%" /></span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[var(--color-gray-900)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: skill.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${skill.progress}%` }}
                  transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </div>

          {/* Ability tree */}
          <div className="relative mt-4">
            <p className="text-3xs text-text-subtle mb-1.5">能力树</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.abilities.map((ability) => (
                <AbilityChip key={ability.name} ability={ability} skillLevel={skill.level} color={skill.color} />
              ))}
            </div>
          </div>
        </GlassCard>
      </button>
    </motion.div>
  );
}

function StatusBadge({ meta }: { meta: LiveStatusMeta }) {
  return (
    <span
      className="relative inline-flex items-center gap-1.5 text-3xs font-medium px-2 py-1 rounded-full shrink-0"
      style={{
        color: meta.color,
        backgroundColor: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 19%, transparent)`,
      }}
    >
      {meta.pulse && (
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: meta.color }}
          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {meta.label}
    </span>
  );
}

function AbilityChip({
  ability,
  skillLevel,
  color,
}: {
  ability: SkillAbility;
  skillLevel: number;
  color: string;
}) {
  const isCurrent = ability.unlocked && ability.level === skillLevel;
  return (
    <span
      className="inline-flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded-md transition-colors"
      style={{
        color: ability.unlocked ? color : 'var(--color-apple-gray)',
        backgroundColor: ability.unlocked
          ? `color-mix(in srgb, ${color} 7%, transparent)`
          : 'var(--color-gray-950)',
        border: `1px solid ${ability.unlocked ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--color-gray-900)'}`,
        fontWeight: isCurrent ? 600 : 400,
      }}
    >
      {ability.unlocked ? <Check size={10} /> : <Circle size={9} />}
      <span>{ability.name}</span>
    </span>
  );
}

export default SkillsSection;
