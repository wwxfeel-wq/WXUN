'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Heart,
  Plus,
  TreePine,
  Lightbulb,
  Sprout,
  Leaf,
  Flower2,
  Users,
  TrendingUp,
  Sparkles,
  Brain,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { apiClient } from '@/lib/api-client';
import LifeTreePreview, { getTreeStage } from '@/components/tree/life-tree-preview';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE },
};

const springHover = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 28,
};

function CircularProgress({ progress, size = 36, reducedMotion = false }: { progress: number; size?: number; reducedMotion?: boolean }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-label={`成长进度 ${Math.round(progress)}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-gray-900)"
        strokeWidth="3"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={reducedMotion ? { duration: 0 } : { duration: 1, ease: EASE }}
      />
    </svg>
  );
}

export default function DigitalLifeCenter() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState({ memories: 0, interviews: 0, capsules: 0, weeklyNew: 0 });
  const [loading, setLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const motionProps = shouldReduceMotion
    ? { initial: false, animate: false }
    : undefined;

  const treeStage = useMemo(
    () => getTreeStage(stats.memories, stats.interviews, stats.capsules),
    [stats],
  );

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [memRes, intRes, capRes] = await Promise.all([
          apiClient.get('/memories/stats').catch(() => ({ total: 0 })),
          apiClient.get('/interviews').catch(() => ({ items: [] })),
          apiClient.get('/capsules').catch(() => ({ items: [] })),
        ]);
        setStats({
          memories: (memRes as { total?: number })?.total ?? 0,
          interviews: (intRes as { items?: unknown[] })?.items?.length ?? 0,
          capsules: (capRes as { items?: unknown[] })?.items?.length ?? 0,
          weeklyNew: 3,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="w-full h-80vh flex items-center justify-center">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-accent/50"
              animate={shouldReduceMotion ? { opacity: 0.6 } : { opacity: [0.3, 1, 0.3] }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="w-full min-h-screen px-4 sm:px-8 lg:px-16 py-8 sm:py-10" style={{ paddingBottom: 'calc(var(--home-mobile-dock-clearance) + var(--safe-bottom) + var(--space-2xl))' }}>
        <div className="max-w-6xl mx-auto">
          {/* ===== Hero Section ===== */}
          <motion.div
            {...fadeUp}
            {...motionProps}
            className="mb-10 sm:mb-14 text-center"
          >
            <GlassLayer
              asChild
              intensity="default"
              className="inline-flex items-center gap-2 px-4 py-1.5 mb-5"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1, duration: 0.5, ease: EASE }}
              >
                <Sparkles size={13} className="text-accent" aria-hidden="true" />
                <span className="text-xs text-text-muted">时墨已陪伴 <span className="text-accent font-medium">0</span> 天</span>
              </motion.div>
            </GlassLayer>
            <h1 className="text-3xl sm:text-4xl font-display font-semibold text-text tracking-tight mb-2">
              数字生命中心
            </h1>
            <p className="text-sm text-text-muted">
              家庭成长 · 生命树 · 家庭状态
            </p>
          </motion.div>

          {/* ===== Status Metrics ===== */}
          <motion.div
            {...fadeUp}
            {...motionProps}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-14"
          >
            <MetricCard icon={Heart} label="家庭情绪" value="温暖" accent="highlight" reducedMotion={!!shouldReduceMotion} />
            <MetricCard icon={Plus} label="本周新增" value="3 段回忆" accent="success" reducedMotion={!!shouldReduceMotion} />
            <MetricCard icon={TreePine} label="生命树阶段" value={treeStage.label} accent="primary" reducedMotion={!!shouldReduceMotion} />
            <MetricCard icon={Lightbulb} label="今日建议" value="给爸妈打个电话" accent="secondary" reducedMotion={!!shouldReduceMotion} />
          </motion.div>

          {/* ===== Main Content ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 mb-8 sm:mb-10">
            {/* Left: Timeline */}
            <GlassLayer
              asChild
              intensity="strong"
              className="lg:col-span-4 p-5 sm:p-6"
            >
              <motion.div
                {...fadeUp}
                {...motionProps}
                transition={{ ...fadeUp.transition, delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <Sprout size={16} className="text-primary" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-text">成长时间线</h2>
                </div>
                <div className="relative pl-3">
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-glass-border" />
                  <TimelineItem icon={Sprout} stage="种子" desc="数字生命初萌芽" active={treeStage.stageIndex >= 0} />
                  <TimelineItem icon={Leaf} stage="萌芽" desc="第一次家庭访谈" active={treeStage.stageIndex >= 1} />
                  <TimelineItem icon={TreePine} stage="成长" desc="积累 10 段记忆" active={treeStage.stageIndex >= 2} />
                  <TimelineItem icon={Flower2} stage="繁茂" desc="生命树完全展开" active={treeStage.stageIndex >= 3} />
                </div>
              </motion.div>
            </GlassLayer>

            {/* Center: Life Tree Preview */}
            <GlassLayer
              asChild
              intensity="strong"
              className="lg:col-span-5 p-5 sm:p-6 flex flex-col relative overflow-hidden group rounded-[var(--radius-2xl)] cursor-default"
            >
              <motion.div
                {...fadeUp}
                {...motionProps}
                transition={{ ...fadeUp.transition, delay: 0.25 }}
                whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.01, transition: springHover }}
              >
                {/* 环境辉光 */}
                <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full blur-orb-lg opacity-[0.16] pointer-events-none bg-primary" />
                <div className="absolute -bottom-28 -left-28 h-56 w-56 rounded-full blur-orb-lg opacity-[0.12] pointer-events-none bg-secondary" />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(ellipse 80% 60% at 50% 100%, var(--color-primary-glow), transparent 70%)',
                    opacity: 0.35,
                  }}
                />

                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-2">
                    <TreePine size={16} className="text-primary" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-text">生命树预览</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <GlassLayer
                      asChild
                      intensity="default"
                      className="px-2.5 py-1 text-xs text-primary rounded-[var(--radius-full)]"
                    >
                      <span>
                        {treeStage.label}
                      </span>
                    </GlassLayer>
                    <CircularProgress progress={treeStage.progress} size={36} reducedMotion={!!shouldReduceMotion} />
                  </div>
                </div>

                <LifeTreePreview
                  memories={stats.memories}
                  interviews={stats.interviews}
                  capsules={stats.capsules}
                  className="w-full relative z-10"
                />
              </motion.div>
            </GlassLayer>

            {/* Right: Family Status */}
            <GlassLayer
              asChild
              intensity="strong"
              className="lg:col-span-3 p-5 sm:p-6"
            >
              <motion.div
                {...fadeUp}
                {...motionProps}
                transition={{ ...fadeUp.transition, delay: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <Users size={16} className="text-secondary" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-text">家庭状态</h2>
                </div>
                <StaggerContainer className="space-y-2">
                  <StaggerItem>
                    <FamilyMemberRow name={user?.profile?.nickname || '我'} role="管理员" status="在线" color="var(--color-secondary)" reducedMotion={!!shouldReduceMotion} />
                  </StaggerItem>
                  <StaggerItem>
                    <FamilyMemberRow name="爸爸" role="成员" status="最近活跃" color="var(--color-highlight)" reducedMotion={!!shouldReduceMotion} />
                  </StaggerItem>
                  <StaggerItem>
                    <FamilyMemberRow name="妈妈" role="成员" status="最近活跃" color="var(--color-error)" reducedMotion={!!shouldReduceMotion} />
                  </StaggerItem>
                  <StaggerItem>
                    <FamilyMemberRow name="时墨 AI" role="家庭助手" status="服务中" color="var(--color-primary)" reducedMotion={!!shouldReduceMotion} />
                  </StaggerItem>
                </StaggerContainer>

                <div className="mt-5 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-text-muted">家庭温暖指数</span>
                    <span className="text-highlight font-medium">87</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-highlight"
                      initial={{ width: 0 }}
                      animate={{ width: '87%' }}
                      transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.6, duration: 1, ease: EASE }}
                    />
                  </div>
                </div>
              </motion.div>
            </GlassLayer>
          </div>

          {/* ===== Bottom Section ===== */}
          <motion.div
            {...fadeUp}
            {...motionProps}
            transition={{ ...fadeUp.transition, delay: 0.35 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6"
          >
            {/* Growth Report */}
            <GlassLayer
              asChild
              intensity="strong"
              className="p-5 sm:p-6 relative overflow-hidden"
            >
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                transition={springHover}
              >
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full blur-orb-md opacity-[0.10] pointer-events-none bg-accent" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
                      <TrendingUp size={18} className="text-accent" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-text">成长报告</h2>
                      <p className="text-xs text-text-muted">阶段性人生总结</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <GlassLayer className="p-3 text-center">
                      <div className="text-xl font-display font-medium text-text">{stats.memories}</div>
                      <div className="text-xs text-text-subtle">记忆总数</div>
                    </GlassLayer>
                    <GlassLayer className="p-3 text-center">
                      <div className="text-xl font-display font-medium text-text">{stats.interviews}</div>
                      <div className="text-xs text-text-subtle">访谈次数</div>
                    </GlassLayer>
                    <GlassLayer className="p-3 text-center">
                      <div className="text-xl font-display font-medium text-text">{stats.capsules}</div>
                      <div className="text-xs text-text-subtle">时间胶囊</div>
                    </GlassLayer>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    本周新增了 3 段珍贵回忆，家庭情绪整体温暖。继续记录与家人的日常点滴，让生命树更加繁茂。
                  </p>
                </div>
              </motion.div>
            </GlassLayer>

            {/* Life Map */}
            <GlassLayer
              asChild
              intensity="strong"
              className="p-5 sm:p-6 relative overflow-hidden"
            >
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                transition={springHover}
              >
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full blur-orb-md opacity-[0.10] pointer-events-none bg-[var(--color-purple)]" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-purple)]/10">
                      <Brain size={18} className="text-[var(--color-purple)]" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-text">人生图谱</h2>
                      <p className="text-xs text-text-muted">记忆主题分布</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Bar label="家庭" width={45} color="var(--color-highlight)" reducedMotion={!!shouldReduceMotion} />
                    <Bar label="成长" width={30} color="var(--color-success)" reducedMotion={!!shouldReduceMotion} />
                    <Bar label="旅行" width={15} color="var(--color-secondary)" reducedMotion={!!shouldReduceMotion} />
                    <Bar label="其他" width={10} color="var(--color-purple)" reducedMotion={!!shouldReduceMotion} />
                  </div>
                </div>
              </motion.div>
            </GlassLayer>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
  reducedMotion = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  accent: 'primary' | 'success' | 'highlight' | 'secondary';
  reducedMotion?: boolean;
}) {
  const accentMap = {
    primary: { color: 'var(--color-primary)', glow: 'var(--color-primary-glow)' },
    success: { color: 'var(--color-success)', glow: 'var(--color-success-bg)' },
    highlight: { color: 'var(--color-highlight)', glow: 'var(--color-highlight-glow)' },
    secondary: { color: 'var(--color-secondary)', glow: 'var(--color-secondary-glow)' },
  };
  const { color, glow } = accentMap[accent];

  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-4 sm:p-5 relative overflow-hidden"
      style={{
        boxShadow: `var(--shadow-sm), inset 0 1px 0 var(--color-glass-highlight), 0 0 20px ${glow}`,
        borderColor: `color-mix(in srgb, ${color}, transparent 80%)`,
      }}
    >
      <motion.div
        whileHover={reducedMotion ? undefined : { y: -3, scale: 1.02 }}
        transition={springHover}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} style={{ color }} aria-hidden="true" />
          <span className="text-xs text-text-subtle">{label}</span>
        </div>
        <div className="text-lg sm:text-xl font-display font-medium text-text">{value}</div>
      </motion.div>
    </GlassLayer>
  );
}

function TimelineItem({
  icon: Icon,
  stage,
  desc,
  active,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  stage: string;
  desc: string;
  active: boolean;
}) {
  return (
    <div className="relative flex items-start gap-3 mb-5 last:mb-0">
      <div
        className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: active ? 'color-mix(in srgb, var(--color-primary), transparent 60%)' : 'var(--color-gray-900)',
          backgroundColor: active ? 'color-mix(in srgb, var(--color-primary), transparent 88%)' : 'var(--color-gray-950)',
        }}
      >
        <Icon size={12} style={{ color: active ? 'var(--color-primary)' : 'var(--color-gray-500)' }} aria-hidden="true" />
      </div>
      <div>
        <div className={`text-sm font-medium ${active ? 'text-text' : 'text-text-muted'}`}>{stage}</div>
        <div className="text-xs text-text-subtle">{desc}</div>
      </div>
    </div>
  );
}

function FamilyMemberRow({
  name,
  role,
  status,
  color,
  reducedMotion = false,
}: {
  name: string;
  role: string;
  status: string;
  color: string;
  reducedMotion?: boolean;
}) {
  return (
    <GlassLayer
      asChild
      intensity="default"
      className="flex items-center gap-3 p-3"
    >
      <motion.div
        whileHover={reducedMotion ? undefined : { y: -2, scale: 1.01 }}
        transition={springHover}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: `color-mix(in srgb, ${color}, transparent 75%)`,
            backgroundColor: `color-mix(in srgb, ${color}, transparent 88%)`,
          }}
        >
          <Users size={14} style={{ color }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{name}</p>
          <p className="text-xs text-text-subtle">{role}</p>
        </div>
        <span
          className="shrink-0 text-xs px-2 py-0.5 rounded-full"
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)`,
            border: `1px solid color-mix(in srgb, ${color}, transparent 70%)`,
          }}
        >
          {status}
        </span>
      </motion.div>
    </GlassLayer>
  );
}

function Bar({ label, width, color, reducedMotion = false }: { label: string; width: number; color: string; reducedMotion?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-subtle w-10 shrink-0">{label}</span>
      <div className="flex-1 bg-surface rounded-full h-1.5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={reducedMotion ? { duration: 0 } : { delay: 0.8, duration: 0.8, ease: EASE }}
        />
      </div>
      <span className="text-xs text-text-subtle w-8 text-right">{width}%</span>
    </div>
  );
}
