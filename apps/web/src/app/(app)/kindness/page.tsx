'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Heart,
  Sparkles,
  BookHeart,
  Bell,
  RefreshCw,
  Gift,
  Sun,
  Clock,
  MapPin,
  Users,
  TrendingUp,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { kindnessApi } from '@/lib/api-client';

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

/** 温暖瞬间类型 */
interface KindnessMemory {
  id: string;
  timestamp: string;
  people: string[];
  event: string;
  emotion: string;
  location?: string;
  story?: string;
  importance: number;
}

/** 家庭短故事类型 */
interface FamilyStory {
  id: string;
  title: string;
  content: string;
  period: string;
  createdAt: string;
}

/** 温暖提醒类型 */
interface WarmReminder {
  id: string;
  message: string;
  createdAt: string;
}

/** 温暖节点类型颜色 */
const KINDNESS_COLORS = {
  warm: '#f0c674',
  family: '#7ec699',
  childhood: '#e8a45c',
  golden: '#f5d76e',
};

export default function KindnessEnginePage() {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion ? { initial: false, animate: false } : undefined;

  const [memories, setMemories] = useState<KindnessMemory[]>([]);
  const [stories, setStories] = useState<FamilyStory[]>([]);
  const [reminder, setReminder] = useState<WarmReminder | null>(null);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, stories: 0 });
  const [loading, setLoading] = useState(true);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [generatingReminder, setGeneratingReminder] = useState(false);
  const [reconstructing, setReconstructing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [memRes, statsRes, storiesRes] = await Promise.all([
        kindnessApi.list({ pageSize: 20 }).catch(() => ({ items: [] })),
        kindnessApi.getStats().catch(() => ({ total: 0, thisWeek: 0, stories: 0 })),
        kindnessApi.getShortStories(1, 5).catch(() => ({ items: [] })),
      ]);
      setMemories((memRes as { items?: KindnessMemory[] })?.items ?? []);
      setStats((statsRes as { total: number; thisWeek: number; stories: number }) ?? { total: 0, thisWeek: 0, stories: 0 });
      setStories((storiesRes as { items?: FamilyStory[] })?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 生成家庭短故事 */
  const handleGenerateStory = async () => {
    setGeneratingStory(true);
    try {
      const result = await kindnessApi.generateShortStory('daily');
      const newStory = result as FamilyStory;
      if (newStory?.id) {
        setStories((prev) => [newStory, ...prev]);
      }
    } catch {
      // 静默失败
    } finally {
      setGeneratingStory(false);
    }
  };

  /** 生成每日温暖提醒 */
  const handleGenerateReminder = async () => {
    setGeneratingReminder(true);
    try {
      const result = await kindnessApi.generateDailyReminder();
      const newReminder = result as WarmReminder;
      if (newReminder?.id) {
        setReminder(newReminder);
      }
    } catch {
      // 静默失败
    } finally {
      setGeneratingReminder(false);
    }
  };

  /** AI 重新讲述温暖瞬间 */
  const handleReconstruct = async (id: string) => {
    setReconstructing(id);
    try {
      const result = await kindnessApi.reconstructStory(id);
      const story = (result as { story?: string })?.story;
      if (story) {
        setMemories((prev) =>
          prev.map((m) => (m.id === id ? { ...m, story } : m)),
        );
      }
    } catch {
      // 静默失败
    } finally {
      setReconstructing(null);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-80vh flex items-center justify-center">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: KINDNESS_COLORS.warm }}
              animate={reduceMotion ? { opacity: 0.6 } : { opacity: [0.3, 1, 0.3] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
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
          {/* ===== Hero ===== */}
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
                transition={reduceMotion ? { duration: 0 } : { delay: 0.1, duration: 0.5, ease: EASE }}
              >
                <Heart size={13} style={{ color: KINDNESS_COLORS.warm }} aria-hidden="true" />
                <span className="text-xs text-text-muted">童年温暖 · 家庭故事 · 陪伴提醒</span>
              </motion.div>
            </GlassLayer>
            <h1 className="text-3xl sm:text-4xl font-display font-semibold text-text tracking-tight mb-2">
              童忆引擎
            </h1>
            <p className="text-sm text-text-muted">
              保存家庭温度的数字伙伴 · 让每一个温暖瞬间都被记住
            </p>
          </motion.div>

          {/* ===== Stats ===== */}
          <motion.div
            {...fadeUp}
            {...motionProps}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-14"
          >
            <StatCard
              icon={Heart}
              label="温暖瞬间"
              value={String(stats.total)}
              color={KINDNESS_COLORS.warm}
              reducedMotion={!!reduceMotion}
            />
            <StatCard
              icon={TrendingUp}
              label="本周新增"
              value={String(stats.thisWeek)}
              color={KINDNESS_COLORS.family}
              reducedMotion={!!reduceMotion}
            />
            <StatCard
              icon={BookHeart}
              label="家庭故事"
              value={String(stats.stories)}
              color={KINDNESS_COLORS.childhood}
              reducedMotion={!!reduceMotion}
            />
            <StatCard
              icon={Gift}
              label="温暖节点"
              value={String(memories.filter((m) => m.importance >= 4).length)}
              color={KINDNESS_COLORS.golden}
              reducedMotion={!!reduceMotion}
            />
          </motion.div>

          {/* ===== Main Grid ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 mb-8 sm:mb-10">
            {/* 左侧：温暖瞬间列表 */}
            <GlassLayer
              asChild
              intensity="strong"
              className="lg:col-span-7 p-5 sm:p-6"
            >
              <motion.div
                {...fadeUp}
                {...motionProps}
                transition={{ ...fadeUp.transition, delay: 0.2 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Heart size={16} style={{ color: KINDNESS_COLORS.warm }} aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-text">温暖瞬间</h2>
                  </div>
                  <button
                    onClick={fetchData}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
                    aria-label="刷新"
                  >
                    <RefreshCw size={12} />
                    刷新
                  </button>
                </div>

                {memories.length === 0 ? (
                  <div className="text-center py-12">
                    <Heart size={32} className="mx-auto mb-3 opacity-20" aria-hidden="true" />
                    <p className="text-sm text-text-muted">还没有温暖瞬间</p>
                    <p className="text-xs text-text-subtle mt-1">
                      时墨会自动从家庭对话中发现温暖行为
                    </p>
                  </div>
                ) : (
                  <StaggerContainer className="space-y-3">
                    {memories.map((mem) => (
                      <StaggerItem key={mem.id}>
                        <KindnessCard
                          memory={mem}
                          onReconstruct={() => handleReconstruct(mem.id)}
                          reconstructing={reconstructing === mem.id}
                          reducedMotion={!!reduceMotion}
                        />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                )}
              </motion.div>
            </GlassLayer>

            {/* 右侧：温暖提醒 + 家庭故事 */}
            <div className="lg:col-span-5 space-y-5 sm:space-y-6">
              {/* 每日温暖提醒 */}
              <GlassLayer
                asChild
                intensity="strong"
                className="p-5 sm:p-6 relative overflow-hidden"
              >
                <motion.div
                  {...fadeUp}
                  {...motionProps}
                  transition={{ ...fadeUp.transition, delay: 0.25 }}
                  whileHover={reduceMotion ? undefined : { y: -3 }}
                >
                  <div
                    className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-orb-md opacity-[0.12] pointer-events-none"
                    style={{ backgroundColor: KINDNESS_COLORS.warm }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Bell size={16} style={{ color: KINDNESS_COLORS.warm }} aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-text">每日温暖提醒</h2>
                      </div>
                      <button
                        onClick={handleGenerateReminder}
                        disabled={generatingReminder}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50"
                        style={{
                          color: KINDNESS_COLORS.warm,
                          backgroundColor: `color-mix(in srgb, ${KINDNESS_COLORS.warm}, transparent 88%)`,
                          border: `1px solid color-mix(in srgb, ${KINDNESS_COLORS.warm}, transparent 70%)`,
                        }}
                      >
                        <Sun size={12} />
                        {generatingReminder ? '生成中...' : '生成提醒'}
                      </button>
                    </div>

                    {reminder ? (
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="p-4 rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${KINDNESS_COLORS.warm}, transparent 92%)`,
                          border: `1px solid color-mix(in srgb, ${KINDNESS_COLORS.warm}, transparent 80%)`,
                        }}
                      >
                        <p className="text-sm text-text leading-relaxed">{reminder.message}</p>
                        <div className="flex items-center gap-1 mt-3 text-xs text-text-subtle">
                          <Clock size={11} />
                          {new Date(reminder.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </motion.div>
                    ) : (
                      <div className="text-center py-8">
                        <Bell size={28} className="mx-auto mb-2 opacity-20" aria-hidden="true" />
                        <p className="text-sm text-text-muted">点击生成今日温暖提醒</p>
                        <p className="text-xs text-text-subtle mt-1">类似童年公益广告的短暂陪伴</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </GlassLayer>

              {/* 家庭短故事 */}
              <GlassLayer
                asChild
                intensity="strong"
                className="p-5 sm:p-6 relative overflow-hidden"
              >
                <motion.div
                  {...fadeUp}
                  {...motionProps}
                  transition={{ ...fadeUp.transition, delay: 0.3 }}
                  whileHover={reduceMotion ? undefined : { y: -3 }}
                >
                  <div
                    className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-orb-md opacity-[0.10] pointer-events-none"
                    style={{ backgroundColor: KINDNESS_COLORS.childhood }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <BookHeart size={16} style={{ color: KINDNESS_COLORS.childhood }} aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-text">家庭短故事</h2>
                      </div>
                      <button
                        onClick={handleGenerateStory}
                        disabled={generatingStory}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50"
                        style={{
                          color: KINDNESS_COLORS.childhood,
                          backgroundColor: `color-mix(in srgb, ${KINDNESS_COLORS.childhood}, transparent 88%)`,
                          border: `1px solid color-mix(in srgb, ${KINDNESS_COLORS.childhood}, transparent 70%)`,
                        }}
                      >
                        <Sparkles size={12} />
                        {generatingStory ? '创作中...' : '生成故事'}
                      </button>
                    </div>

                    {stories.length === 0 ? (
                      <div className="text-center py-8">
                        <BookHeart size={28} className="mx-auto mb-2 opacity-20" aria-hidden="true" />
                        <p className="text-sm text-text-muted">还没有家庭故事</p>
                        <p className="text-xs text-text-subtle mt-1">AI 会根据家庭记忆创作温暖短故事</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {stories.map((story) => (
                          <StoryCard key={story.id} story={story} reducedMotion={!!reduceMotion} />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </GlassLayer>
            </div>
          </div>

          {/* ===== Bottom: 四种温暖节点图例 ===== */}
          <motion.div
            {...fadeUp}
            {...motionProps}
            transition={{ ...fadeUp.transition, delay: 0.35 }}
          >
            <GlassLayer
              asChild
              intensity="strong"
              className="p-5 sm:p-6"
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-accent" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-text">温暖节点类型</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <NodeLegend color={KINDNESS_COLORS.warm} label="普通记忆节点" desc="柔和蓝色 · 日常温暖" />
                  <NodeLegend color={KINDNESS_COLORS.family} label="家庭事件" desc="绿色 · 家庭互动" />
                  <NodeLegend color={KINDNESS_COLORS.childhood} label="童年温暖节点" desc="暖黄色 · 童年回忆" />
                  <NodeLegend color={KINDNESS_COLORS.golden} label="重要家庭瞬间" desc="金色核心 · 珍贵时刻" />
                </div>
              </div>
            </GlassLayer>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}

// ═══ Sub Components ═══

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  reducedMotion = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  color: string;
  reducedMotion?: boolean;
}) {
  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-4 sm:p-5 relative overflow-hidden"
      style={{
        boxShadow: `var(--shadow-sm), inset 0 1px 0 var(--color-glass-highlight), 0 0 20px color-mix(in srgb, ${color}, transparent 90%)`,
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

function KindnessCard({
  memory,
  onReconstruct,
  reconstructing,
  reducedMotion = false,
}: {
  memory: KindnessMemory;
  onReconstruct: () => void;
  reconstructing: boolean;
  reducedMotion?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const color =
    memory.importance >= 4
      ? KINDNESS_COLORS.golden
      : memory.emotion?.includes('童年')
        ? KINDNESS_COLORS.childhood
        : memory.emotion?.includes('家庭')
          ? KINDNESS_COLORS.family
          : KINDNESS_COLORS.warm;

  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-4 relative overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${color}, transparent 80%)`,
      }}
    >
      <motion.div
        whileHover={reducedMotion ? undefined : { y: -2 }}
        transition={springHover}
      >
        <div className="flex items-start gap-3">
          {/* 温暖光点 */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${color}, transparent 88%)`,
              border: `1px solid color-mix(in srgb, ${color}, transparent 70%)`,
            }}
          >
            <Heart size={14} style={{ color }} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            {/* 事件描述 */}
            <p className="text-sm text-text leading-relaxed mb-2">{memory.event}</p>

            {/* 标签 */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
              {memory.people?.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {memory.people.join('、')}
                </span>
              )}
              {memory.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {memory.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {new Date(memory.timestamp).toLocaleDateString('zh-CN')}
              </span>
              {memory.emotion && (
                <span
                  className="px-2 py-0.5 rounded-full"
                  style={{
                    color,
                    backgroundColor: `color-mix(in srgb, ${color}, transparent 88%)`,
                  }}
                >
                  {memory.emotion}
                </span>
              )}
            </div>

            {/* AI 讲述的故事 */}
            {memory.story && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mt-3 p-3 rounded-lg"
                style={{
                  backgroundColor: `color-mix(in srgb, ${color}, transparent 94%)`,
                  border: `1px solid color-mix(in srgb, ${color}, transparent 85%)`,
                }}
              >
                <p className="text-xs text-text-muted leading-relaxed italic">{memory.story}</p>
              </motion.div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-text-subtle hover:text-text transition-colors"
              >
                {expanded ? '收起' : '展开'}
              </button>
              <button
                onClick={onReconstruct}
                disabled={reconstructing}
                className="flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
                style={{ color }}
              >
                <Sparkles size={11} />
                {reconstructing ? 'AI 讲述中...' : memory.story ? '重新讲述' : 'AI 讲述'}
              </button>
            </div>

            {expanded && memory.story && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-xs text-text-muted leading-relaxed"
              >
                {memory.story}
              </motion.div>
            )}
          </div>

          {/* 重要度指示 */}
          {memory.importance >= 4 && (
            <div
              className="shrink-0 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: KINDNESS_COLORS.golden, boxShadow: `0 0 6px ${KINDNESS_COLORS.golden}` }}
              title="重要瞬间"
            />
          )}
        </div>
      </motion.div>
    </GlassLayer>
  );
}

function StoryCard({
  story,
  reducedMotion = false,
}: {
  story: FamilyStory;
  reducedMotion?: boolean;
}) {
  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-3"
    >
      <motion.div whileHover={reducedMotion ? undefined : { y: -2 }} transition={springHover}>
        <div className="flex items-center gap-2 mb-2">
          <BookHeart size={12} style={{ color: KINDNESS_COLORS.childhood }} aria-hidden="true" />
          <span className="text-xs font-medium text-text truncate">{story.title}</span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed line-clamp-3">{story.content}</p>
        <div className="flex items-center gap-1 mt-2 text-xs text-text-subtle">
          <Clock size={10} />
          {new Date(story.createdAt).toLocaleDateString('zh-CN')}
        </div>
      </motion.div>
    </GlassLayer>
  );
}

function NodeLegend({
  color,
  label,
  desc,
}: {
  color: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 94%)` }}>
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <div className="min-w-0">
        <div className="text-xs font-medium text-text truncate">{label}</div>
        <div className="text-xs text-text-subtle truncate">{desc}</div>
      </div>
    </div>
  );
}
