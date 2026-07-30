'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Heart,
  ChefHat,
  Wrench,
  ShoppingCart,
  Plane,
  Dumbbell,
  BookOpen,
  Users,
  HandHeart,
  PawPrint,
  Sprout,
  Zap,
  Brain,
  TrendingUp,
  ChevronRight,
  Bot,
  MessageCircle,
  Smile,
  HeartPulse,
  Globe,
  Calendar,
} from 'lucide-react';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import type { AgentRuntime, SkillProgress } from '@/stores/family-hub-store';
import { GlassLayer } from '@/components/glass';

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

const iconMap: Record<string, IconComponent> = {
  Heart,
  ChefHat,
  Wrench,
  ShoppingCart,
  Plane,
  Dumbbell,
  BookOpen,
  Users,
  HandHeart,
  PawPrint,
  Sprout,
  Zap,
  Brain,
  TrendingUp,
  Bot,
  MessageCircle,
  Smile,
  HeartPulse,
  Globe,
  Calendar,
};

export default function InkDrop() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'skills'>('overview');
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { agents, skills, shimoCore, fetchAll } = useFamilyHubStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    if (expanded) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [expanded]);

  // Map backend AgentRuntime data to display format
  const displayAgents = agents.map((a: AgentRuntime) => ({
    ...a,
    icon: iconMap[a.icon] || Brain,
    label: a.name,
    status: (a.status === 'running' || a.status === 'thinking' ? 'active' : a.status === 'learning' ? 'learning' : 'idle') as 'active' | 'idle' | 'learning',
  }));

  // Map backend SkillProgress data to display format
  const displaySkills = skills.map((s: SkillProgress) => ({
    ...s,
    icon: iconMap[s.icon] || Brain,
    label: s.name,
    status: (s.status === 'mastered' ? '已掌握' : '学习中') as '已掌握' | '学习中',
  }));

  const masteredCount = displaySkills.filter((s) => s.status === '已掌握').length;
  const activeAgents = displayAgents.filter((a) => a.status === 'active').length;

  // Derive incubating skills from learning skills
  const incubatingSkills = displaySkills
    .filter((s) => s.status === '学习中')
    .slice(0, 3)
    .map((s) => {
      const progress = s.progress || 0;
      return {
        name: s.label,
        progress,
        eta: progress > 80 ? '即将完成' : '继续学习中',
        agent: s.sourceAgent,
      };
    });

  return (
    <div ref={containerRef} className="fixed left-6 z-fixed hidden sm:block" style={{ bottom: 'calc(var(--home-dock-clearance) + var(--space-2xl))' }}>
      {/* Ink Drop Button */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="打开时墨"
        className={`
          relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer
          border border-glass-border backdrop-blur-2xl transition-[color,background-color,border-color] duration-500 focus-ring
          ${expanded
            ? 'bg-accent/15 text-accent'
            : 'bg-glass hover:bg-glass-hover text-text-muted hover:text-text'
          }
        `}
      >
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Brain size={20} strokeWidth={1.5} />
        </motion.div>

        {!expanded && (
          <motion.div
            className="absolute inset-0 rounded-full border border-accent/15"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </motion.button>

      {/* Label */}
      <AnimatePresence>
        {!expanded && (
          <GlassLayer
            intensity="default"
            className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg"
          >
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-xs text-text-subtle whitespace-nowrap"
            >
              时墨
            </motion.div>
          </GlassLayer>
        )}
      </AnimatePresence>

      {/* Expanded Family AI Core Panel */}
      <AnimatePresence>
        {expanded && (
          <GlassLayer
            intensity="strong"
            className="absolute bottom-16 left-0 p-5 max-w-sm max-h-80vh overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.3, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.3, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Zap size={18} className="text-accent" />
              </div>
              <div>
                <div className="text-sm font-medium text-text">时墨</div>
                <div className="text-2xs text-text-subtle">
                  正在慢慢理解这个家的点点滴滴
                </div>
              </div>
            </div>

            {/* Core Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-2.5 rounded-xl bg-glass border border-glass-border text-center">
                <div className="text-sm font-medium text-text">{displayAgents.length}</div>
                <div className="text-3xs text-text-subtle">守护者</div>
              </div>
              <div className="p-2.5 rounded-xl bg-glass border border-glass-border text-center">
                <div className="text-sm font-medium text-success">{masteredCount}</div>
                <div className="text-3xs text-text-subtle">能力</div>
              </div>
              <div className="p-2.5 rounded-xl bg-glass border border-glass-border text-center">
                <div className="text-sm font-medium text-accent">{activeAgents}</div>
                <div className="text-3xs text-text-subtle">陪伴中</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl bg-glass">
              {(['overview', 'agents', 'skills'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-2xs transition-colors focus-ring ${
                    activeTab === tab
                      ? 'bg-glass-strong text-text'
                      : 'text-text-subtle hover:text-text-secondary'
                  }`}
                >
                  {tab === 'overview' ? '概览' : tab === 'agents' ? '守护者' : '能力'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Recently learned */}
                <GlassLayer intensity="default" className="p-3 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-success"
                    />
                    <span className="text-2xs text-text-subtle">最近学习内容</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {shimoCore.recentLearning.length > 0 ? (
                      shimoCore.recentLearning.map((item, i) => (
                        <span
                          key={i}
                          className={`skill-capsule ${i === 0 ? 'active' : ''} px-2.5 py-1 text-3xs ${i === 0 ? 'text-accent' : 'text-text-subtle'}`}
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="px-2.5 py-1 text-3xs text-text-subtle">暂无学习内容</span>
                    )}
                  </div>
                </GlassLayer>

                {/* Skill Incubator */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xs text-text-subtle">正在长大的能力</span>
                    <button
                      onClick={() => { setExpanded(false); router.push('/evolution'); }}
                      className="text-3xs text-accent flex items-center gap-0.5 hover:underline focus-ring rounded px-1"
                    >
                      查看全部 <ChevronRight size={10} />
                    </button>
                  </div>
                  {incubatingSkills.length > 0 ? (
                    incubatingSkills.map((skill) => (
                      <div key={skill.name} className="mb-2 last:mb-0 p-3 rounded-xl bg-glass border border-glass-border">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-text">{skill.name}</span>
                          <span className="text-3xs text-text-subtle">{skill.progress}%</span>
                        </div>
                        <div className="w-full bg-[var(--color-gray-900)] rounded-full h-1.5 mb-1.5">
                          <motion.div
                            className="h-full rounded-full gradient-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${skill.progress}%` }}
                            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                        <div className="text-3xs text-text-subtle/60">
                          来自 {skill.agent} · {skill.eta}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 rounded-xl bg-glass border border-glass-border text-center">
                      <span className="text-3xs text-text-subtle">暂无孵化中的技能</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'agents' && (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {displayAgents.length > 0 ? (
                  displayAgents.map((agent, index) => {
                    const Icon = agent.icon;
                    return (
                      <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="p-2.5 rounded-xl bg-glass border border-glass-border hover:bg-glass-hover transition-colors cursor-default"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={14} className="text-text-muted" />
                          <span className="text-2xs text-text truncate">{agent.label}</span>
                          {agent.status === 'active' && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                          )}
                          {agent.status === 'learning' && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-highlight animate-pulse" />
                          )}
                        </div>
                        <div className="text-3xs text-text-subtle">{agent.role}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 bg-[var(--color-gray-900)] rounded-full h-1">
                            <div
                              className="h-full rounded-full bg-accent/40"
                              style={{ width: `${(agent.level / 10) * 100}%` }}
                            />
                          </div>
                          <span className="text-4xs text-text-subtle">阶段 {agent.level}</span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="col-span-2 p-4 text-center">
                    <span className="text-2xs text-text-subtle">加载中...</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="grid grid-cols-4 gap-2">
                {displaySkills.length > 0 ? (
                  displaySkills.map((skill, index) => {
                    const Icon = skill.icon;
                    const isHovered = hoveredSkill === skill.id;

                    return (
                      <motion.button
                        key={skill.id}
                        type="button"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                        onHoverStart={() => setHoveredSkill(skill.id)}
                        onHoverEnd={() => setHoveredSkill(null)}
                        className="relative flex flex-col items-center gap-1 p-2.5 rounded-2xl cursor-pointer transition-colors duration-300 hover:bg-glass-hover focus-ring"
                        aria-label={`${skill.label}，${skill.status}，阶段 ${skill.level}`}
                      >
                        <div style={{ color: skill.color }}>
                          <Icon size={18} strokeWidth={1.5} />
                        </div>
                        <span className="text-3xs text-text-muted">{skill.label}</span>

                        {skill.status === '学习中' && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-highlight animate-pulse" />
                        )}

                        <AnimatePresence>
                          {isHovered && (
                            <motion.span
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 4 }}
                              className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-background-elevated text-3xs text-text-subtle whitespace-nowrap z-tooltip pointer-events-none"
                            >
                              {skill.status} · 阶段 {skill.level}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    );
                  })
                ) : (
                  <div className="col-span-4 p-4 text-center">
                    <span className="text-2xs text-text-subtle">加载中...</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer Actions */}
            <div className="mt-4 pt-3 border-t border-border flex gap-2">
              <motion.button
                onClick={() => { setExpanded(false); router.push('/skills'); }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 py-2 rounded-xl bg-glass hover:bg-glass-hover border border-glass-border text-xs text-text-muted hover:text-text transition-colors focus-ring"
              >
                查看全部能力
              </motion.button>
              <motion.button
                onClick={() => { setExpanded(false); router.push('/evolution'); }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 py-2 rounded-xl bg-accent/10 hover:bg-accent/15 border border-accent/15 text-xs text-accent transition-colors focus-ring"
              >
                成长工坊
              </motion.button>
            </div>
            </motion.div>
          </GlassLayer>
        )}
      </AnimatePresence>
    </div>
  );
}
