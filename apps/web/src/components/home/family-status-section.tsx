'use client';

import { motion } from 'framer-motion';
import { getIcon } from '@/components/home/icon-map';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import { StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassCard } from '@/components/glass';

/* ── Shared animation presets ── */
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 今日家庭状态
 *
 * 用更柔软、更像「家人问候」的方式呈现状态，
 * 避免百分比、Level、系统监控等技术语言。
 */
export function FamilyStatusSection() {
  const familyStatus = useFamilyHubStore((s) => s.familyStatus);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">
          今天，家里怎么样
        </h2>
        <p className="text-xs text-text-subtle mt-1">时墨为你记下的温柔提醒</p>
      </div>

      <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {familyStatus.map((item) => {
          const Icon = getIcon(item.icon);
          return (
            <StaggerItem key={item.id} className="h-full">
              <motion.div whileHover={{ y: -3, scale: 1.02 }} transition={SPRING}>
                <GlassCard
                  hoverable
                  className="p-4 h-full cursor-default"
                  caustic={false}
                  shadow={false}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{
                        color: item.color,
                        backgroundColor: `color-mix(in srgb, ${item.color} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${item.color} 16%, transparent)`,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-2xs text-text-subtle">{item.label}</span>
                  </div>
                  <div className="text-sm font-medium text-text leading-snug">{item.value}</div>
                  <div className="text-3xs text-text-subtle/70 mt-1.5 leading-relaxed">
                    {item.sub}
                  </div>
                </GlassCard>
              </motion.div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </motion.section>
  );
}

export default FamilyStatusSection;
