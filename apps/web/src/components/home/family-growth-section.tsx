'use client';

import { motion } from 'framer-motion';
import {
  Heart,
  BookOpen,
  TreePine,
  Sparkles,
  Zap,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import { AnimatedNumber } from '@/components/home/animated-number';
import { StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassCard } from '@/components/glass';

/* ── Shared animation presets ── */
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface GrowthCardConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  value: React.ReactNode;
  caption: string;
}

/**
 * 家庭成长中心
 *
 * 原「家庭 AI 数据中心」的降级重构：
 * - 从 12 宫格指标卡片减为 6 张情感化成长卡片
 * - 去掉 Level / Agent / 数据中心等后台语言
 * - 用「共同回忆」「家庭默契」「今日成长」等家庭语言
 */
export function FamilyGrowthSection() {
  const metrics = useFamilyHubStore((s) => s.metrics);

  const cards: GrowthCardConfig[] = [
    {
      label: '家庭默契',
      icon: Heart,
      color: 'var(--color-rose)',
      value: <AnimatedNumber value={metrics.understandingPercent} suffix="%" className="text-2xl" />,
      caption: '时墨对家的理解',
    },
    {
      label: '共同回忆',
      icon: BookOpen,
      color: 'var(--color-secondary)',
      value: <AnimatedNumber value={metrics.longTermMemories} className="text-2xl" />,
      caption: '段珍贵记忆',
    },
    {
      label: '今日成长',
      icon: TreePine,
      color: 'var(--color-success)',
      value: (
        <span className="text-2xl font-semibold tabular-nums">
          Lv.{metrics.treeLevel}
        </span>
      ),
      caption: metrics.treeStage,
    },
    {
      label: '时墨在陪伴',
      icon: Sparkles,
      color: 'var(--color-highlight)',
      value: <AnimatedNumber value={metrics.activeAgents} className="text-2xl" />,
      caption: '个意识在协同',
    },
    {
      label: '能力在成长',
      icon: Zap,
      color: 'var(--color-orange)',
      value: <AnimatedNumber value={metrics.masteredSkills} className="text-2xl" />,
      caption: '项已掌握',
    },
    {
      label: '家人的消息',
      icon: MessageCircle,
      color: metrics.wechatSync === 'connected' ? 'var(--color-success)' : 'var(--color-text-subtle)',
      value: (
        <span className="text-xl font-medium">
          {metrics.wechatSync === 'connected' ? '已连接' : '未连接'}
        </span>
      ),
      caption: metrics.wechatSync === 'connected' ? '微信消息正在流入' : '连接后同步家庭群',
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">
          家庭成长中心
        </h2>
        <p className="text-xs text-text-subtle mt-1">不是数据，是家正在生长的痕迹</p>
      </div>

      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <StaggerItem key={card.label} className="h-full">
              <motion.div whileHover={{ y: -3, scale: 1.02 }} transition={SPRING}>
                <GlassCard hoverable className="p-5 h-full" caustic={false} shadow={false}>
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{
                        color: card.color,
                        backgroundColor: `color-mix(in srgb, ${card.color} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${card.color} 16%, transparent)`,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-2xs text-text-subtle">{card.label}</span>
                  </div>

                  <div className="text-2xl font-semibold text-text tabular-nums tracking-tight">
                    {card.value}
                  </div>
                  <div className="text-3xs text-text-subtle/70 mt-1.5">{card.caption}</div>
                </GlassCard>
              </motion.div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </motion.section>
  );
}

export default FamilyGrowthSection;
