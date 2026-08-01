'use client';

import { useCallback, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, BookOpen, MessageCircle, Sparkles, Users, X } from 'lucide-react';
import { GlassLayer } from '@/components/glass/glass-layer';
import { GlassButton } from '@/components/glass/glass-button';
import { cn } from '@/lib/utils';

/**
 * WelcomeGuide — 新用户引导
 * ─────────────────────────────────────────
 * 当家庭理解度与成员数均为 0 时，在首页展示三步引导卡片，
 * 引导新用户认识时墨、建立家庭、记录第一个回忆。
 *
 * 视觉：Apple Liquid Glass 风格，深色背景，玻璃质感卡片，
 * 柔和翡翠绿强调色；framer-motion 入场（opacity + scale + blur），
 * 完成动作后淡出消失；移动端卡片垂直排列、触控友好。
 *
 * 注：项目实际 GlassLayer 位于 @/components/glass/glass-layer
 * （不存在 @/components/ui/glass-layer），此处沿用真实路径以保持一致。
 */

export interface WelcomeGuideProps {
  /** 是否显示引导（由父组件依据 metrics 判断） */
  show: boolean;
  /** 步骤 1「开始对话」回调；未提供时跳转 /interview */
  onStartChat?: () => void;
  /** 步骤 2「添加成员」回调；未提供时跳转 /family */
  onAddMember?: () => void;
  /** 步骤 3「记录回忆」回调；未提供时跳转 /center */
  onRecordMemory?: () => void;
  /** 引导被关闭时回调（点击跳过或完成动作后触发） */
  onClose?: () => void;
  /** 自定义类名 */
  className?: string;
}

type IconType = ComponentType<{ className?: string; size?: number | string }>;

interface GuideStep {
  index: number;
  icon: IconType;
  title: string;
  desc: string;
  cta: string;
  run: () => void;
}

/** 退出动画时长（秒），dismiss 延迟据此对齐，确保淡出播放完毕再跳转 */
const EXIT_DURATION = 0.42;

export function WelcomeGuide({
  show,
  onStartChat,
  onAddMember,
  onRecordMemory,
  onClose,
  className,
}: WelcomeGuideProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // 内部 dismissing 状态：用户点击动作 / 关闭后触发淡出
  const [dismissing, setDismissing] = useState(false);

  const visible = show && !dismissing;

  /** 触发淡出，待动画播放后再执行跳转 / 打开动作 */
  const dismiss = useCallback(
    (action?: () => void) => {
      if (dismissing) return;
      setDismissing(true);
      onClose?.();
      if (action) {
        // 退出动画完成后再跳转，避免页面切换打断淡出
        window.setTimeout(action, EXIT_DURATION * 1000 + 60);
      }
    },
    [dismissing, onClose],
  );

  const steps: GuideStep[] = [
    {
      index: 1,
      icon: MessageCircle,
      title: '认识时墨',
      desc: '我是时墨，你的家庭生命伙伴。我会记住你家里的每个故事。',
      cta: '开始对话',
      run: () => dismiss(onStartChat ?? (() => router.push('/interview'))),
    },
    {
      index: 2,
      icon: Users,
      title: '建立家庭',
      desc: '添加你的家庭成员，让我开始了解你们的家。',
      cta: '添加成员',
      run: () => dismiss(onAddMember ?? (() => router.push('/family'))),
    },
    {
      index: 3,
      icon: BookOpen,
      title: '记录第一个回忆',
      desc: '说一件今天发生的小事，让我记住它。',
      cta: '记录回忆',
      run: () => dismiss(onRecordMemory ?? (() => router.push('/center'))),
    },
  ];

  // 遮罩层：仅 opacity 淡入淡出
  const backdropVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
    exit: { opacity: 0, transition: { duration: 0.3, ease: 'easeInOut' } },
  };

  // 内容面板：opacity + scale + blur（减少动效时仅 opacity）
  const panelVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.3 } },
        exit: { opacity: 0, transition: { duration: 0.3 } },
      }
    : {
        hidden: { opacity: 0, scale: 0.94, filter: 'blur(14px)' },
        visible: {
          opacity: 1,
          scale: 1,
          filter: 'blur(0px)',
          transition: { duration: 0.55, ease: 'easeOut', delay: 0.05 },
        },
        exit: {
          opacity: 0,
          scale: 0.96,
          filter: 'blur(14px)',
          transition: { duration: EXIT_DURATION, ease: 'easeInOut' },
        },
      };

  // 步骤卡片错峰入场（退出由面板整体淡出承载）
  const gridVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.18 } },
  };

  const cardVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.3 } },
      }
    : {
        hidden: { opacity: 0, y: 18, scale: 0.97, filter: 'blur(8px)' },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { duration: 0.5, ease: 'easeOut' },
        },
      };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome-guide"
          className={cn(
            'fixed inset-0 z-modal flex items-center justify-center p-4 sm:p-6',
            'bg-background/60',
            className,
          )}
          style={{
            backdropFilter: 'blur(12px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
          }}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="新用户引导"
        >
          <motion.div className="relative w-full max-w-4xl" variants={panelVariants}>
            <GlassLayer intensity="modal" className="p-6 sm:p-10">
              {/* 头部 */}
              <header className="mb-7 text-center sm:mb-9">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-primary-faint)] px-3 py-1 text-xs text-[color:var(--color-primary)]">
                  <Sparkles size={12} aria-hidden="true" />
                  <span>新用户引导</span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--color-text-primary)] sm:text-3xl">
                  欢迎来到岁言
                </h2>
                <p className="mt-2 text-sm text-[color:var(--color-text-secondary)] sm:text-base">
                  让时墨陪你，把家变成会记住故事的地方。
                </p>
              </header>

              {/* 步骤卡片 */}
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5"
                variants={gridVariants}
                initial="hidden"
                animate="visible"
              >
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <motion.div key={step.index} variants={cardVariants} className="h-full">
                      <GlassLayer
                        intensity="subtle"
                        smoke={false}
                        noise={false}
                        className="flex h-full flex-col gap-4 p-5 sm:p-6"
                      >
                        {/* 序号 + 图标 */}
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[color:var(--color-text-inverse)]"
                            style={{
                              background:
                                'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                              boxShadow: 'var(--shadow-glow-primary-sm)',
                            }}
                          >
                            <Icon size={20} aria-hidden="true" />
                          </span>
                          <span className="text-xs font-medium text-[color:var(--color-text-tertiary)]">
                            步骤 {step.index} / 3
                          </span>
                        </div>

                        {/* 标题 + 描述 */}
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] sm:text-lg">
                            {step.title}
                          </h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
                            {step.desc}
                          </p>
                        </div>

                        {/* CTA */}
                        <GlassButton
                          variant="primary"
                          size="md"
                          className="w-full"
                          onClick={step.run}
                        >
                          {step.cta}
                          <ArrowRight size={16} aria-hidden="true" />
                        </GlassButton>
                      </GlassLayer>
                    </motion.div>
                  );
                })}
              </motion.div>

              {/* 跳过 */}
              <footer className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="rounded-full px-2 py-1 text-xs text-[color:var(--color-text-tertiary)] underline-offset-4 transition-colors hover:text-[color:var(--color-text-secondary)] hover:underline focus-ring"
                >
                  稍后再说，先逛逛
                </button>
              </footer>
            </GlassLayer>

            {/* 关闭按钮 — 置于玻璃面板外层右上角 */}
            <button
              type="button"
              onClick={() => dismiss()}
              aria-label="关闭引导"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-glass-hover)] hover:text-[color:var(--color-text-primary)] focus-ring"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WelcomeGuide;
