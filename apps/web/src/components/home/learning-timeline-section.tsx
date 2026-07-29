'use client';

import { motion } from 'framer-motion';
import { useFamilyHubStore, type TimelineEntry } from '@/stores/family-hub-store';
import { GlassLayer } from '@/components/glass';

/* ─── Type metadata ─── */
const TYPE_COLOR: Record<TimelineEntry['type'], string> = {
  skill: 'var(--color-secondary)',
  agent: 'var(--color-purple)',
  memory: 'var(--color-highlight)',
  tree: 'var(--color-success)',
  device: 'var(--color-info)',
};

const TYPE_LABEL: Record<TimelineEntry['type'], string> = {
  skill: '新能力',
  agent: '成长',
  memory: '回忆',
  tree: '生命树',
  device: '连接',
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

/**
 * 成长时间线
 *
 * 把「Learning Timeline」改为「时墨和这个家一起成长的记录」。
 * 使用更温暖的标签语言，减少技术术语。
 */
export function LearningTimelineSection() {
  const timeline = useFamilyHubStore((s) => s.timeline);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-lg font-display font-medium text-text tracking-tight">成长时间线</h2>
        <p className="text-xs text-text-subtle mt-1">时墨和家一起，慢慢长大的痕迹</p>
      </div>

      <GlassLayer intensity="default" className="p-5 sm:p-7">
        <div className="relative">
          {timeline.map((entry, index) => {
            const color = TYPE_COLOR[entry.type];
            const isLast = index === timeline.length - 1;

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: index * 0.06 }}
                className="relative flex gap-4 pb-7 last:pb-0"
              >
                {/* Axis column */}
                <div className="relative flex flex-col items-center">
                  <motion.div
                    className="relative z-10 flex h-3 w-3 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: color }}
                    whileHover={{ scale: 1.35 }}
                    transition={spring}
                  >
                    <span className="absolute inset-0 rounded-full blur-md opacity-50" style={{ backgroundColor: color }} />
                    <span className="relative h-1 w-1 rounded-full bg-[var(--color-gray-100)]" />
                  </motion.div>

                  {!isLast && (
                    <div
                      className="absolute top-3 bottom-0 w-px"
                      style={{
                        background: `linear-gradient(to bottom, color-mix(in srgb, ${color} 25%, transparent), var(--color-gray-900))`,
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 -mt-0.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-text-subtle">{entry.date}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-3xs font-medium"
                      style={{
                        color,
                        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
                      }}
                    >
                      {TYPE_LABEL[entry.type]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text">{entry.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{entry.detail}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassLayer>
    </motion.section>
  );
}

export default LearningTimelineSection;
