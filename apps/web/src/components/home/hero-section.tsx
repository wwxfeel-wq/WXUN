'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Mic, ArrowUp, TreePine, Heart, Users, BookOpen, type LucideIcon } from 'lucide-react';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import { GlassLayer } from '@/components/glass';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 时墨在首页的「意识状态」——不是系统负载，而是正在发生的事。
 * 语言上完全隐藏 Agent / API / 认知理解度等技术概念。
 */
const SHIMO_PRESENCE = [
  '正在整理今天家人分享的小事…',
  '刚刚发现一段值得珍藏的回忆',
  '生命树又长出了新的枝芽',
  '在帮你记住妈妈喜欢的口味',
  '正在为一家人准备周末建议…',
];

export function HeroSection() {
  const router = useRouter();
  const metrics = useFamilyHubStore((s) => s.metrics);
  const { masteredSkills, longTermMemories, understandingPercent } = metrics;

  const [statusIndex, setStatusIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % SHIMO_PRESENCE.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) {
        router.push('/interview');
        return;
      }
      router.push(`/interview?q=${encodeURIComponent(inputValue.trim())}`);
    },
    [inputValue, router],
  );

  return (
    <section className="relative flex flex-col items-center text-center px-2 pt-10 sm:pt-16 md:pt-20 pb-4">
      {/* 品牌徽章 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.7, ease: EASE }}
      >
        <GlassLayer
          intensity="subtle"
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-10"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-xs text-text-muted font-medium tracking-wide">
            时墨正在陪伴这个家
          </span>
        </GlassLayer>
      </motion.div>

      {/* 主标题：你好，我是时墨 */}
      <motion.h1
        className="text-4xl sm:text-5xl md:text-6xl font-display font-semibold text-text tracking-tight leading-[1.1]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.9, ease: EASE }}
      >
        你好，
        <br />
        我是时墨。
      </motion.h1>

      <motion.p
        className="mt-5 text-lg sm:text-xl text-text-muted font-normal max-w-md"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
      >
        欢迎回家。
      </motion.p>

      {/* 当前状态 */}
      <motion.div
        className="mt-8 flex items-center justify-center gap-2 text-sm text-text-subtle"
        aria-live="polite"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: EASE }}
      >
        <Sparkles size={14} className="text-accent shrink-0" />
        <AnimatePresence mode="wait">
          <motion.span
            key={statusIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="font-normal"
          >
            {SHIMO_PRESENCE[statusIndex]}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* 主输入框 */}
      <motion.form
        onSubmit={handleSubmit}
        className="mt-10 w-full max-w-xl"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.7, ease: EASE }}
      >
        <GlassLayer
          intensity="strong"
          className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 rounded-3xl"
        >
          <Mic size={18} className="text-text-subtle shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="和时墨聊聊，或分享今天的事…"
            aria-label="和时墨聊聊，或分享今天的事"
            className="flex-1 bg-transparent border-0 outline-none focus-ring text-sm sm:text-base text-text placeholder:text-text-subtle min-w-0"
          />
          <button
            type="submit"
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-accent text-[var(--color-text-inverse)] shrink-0 hover:bg-accent-hover transition-colors duration-200 active:scale-95 focus-ring"
            aria-label="发送"
          >
            <ArrowUp size={18} />
          </button>
        </GlassLayer>
      </motion.form>

      {/* 快捷入口 */}
      <motion.div
        className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.6, ease: EASE }}
      >
        <QuickPill href="/interview" icon={Heart} label="开始陪伴" />
        <QuickPill href="/life-tree" icon={TreePine} label="生命树" />
        <QuickPill href="/family" icon={Users} label="家庭" />
        <QuickPill href="/center" icon={BookOpen} label="回忆" />
      </motion.div>

      {/* 底部轻量统计 */}
      <motion.p
        className="mt-10 text-xs sm:text-sm text-text-subtle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6, ease: EASE }}
      >
        已陪伴 <span className="text-text-muted font-medium">{longTermMemories}</span> 段记忆 ·
        掌握 <span className="text-text-muted font-medium">{masteredSkills}</span> 项能力 ·
        理解这个家 <span className="text-text-muted font-medium">{understandingPercent}%</span>
      </motion.p>
    </section>
  );
}

function QuickPill({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs text-text-muted font-medium transition-[color,background-color] duration-300 hover:text-text hover:bg-[var(--color-glass-hover)] focus-ring"
    >
      <Icon size={14} className="text-text-subtle" />
      {label}
    </Link>
  );
}

export default HeroSection;
