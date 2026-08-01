'use client';

import { FormEvent, useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  GraduationCap,
  Heart,
  Hourglass,
  MessageCircle,
  MessagesSquare,
  Orbit,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { GlassLayer } from '@/components/glass';
import LifeCoreCanvas, { type LifeCoreState, type LifeCoreCounts } from '@/components/life-core/life-core-canvas';
import ConsciousnessPanel from '@/components/life-core/consciousness-panel';
import { WelcomeGuide } from '@/components/onboarding/welcome-guide';
import HomeChatOverlay from './home-chat-overlay';
import { useFamilyHubStore } from '@/stores/family-hub-store';

/** 左侧家庭入口：进入家庭空间的六个核心方向
 *  时墨（陪伴）排在最后，作为 AI 入口收底 */
const familyEntries = [
  { href: '/family', icon: Users, label: '家人', hint: '成员与关系' },
  { href: '/center', icon: Sparkles, label: '回忆', hint: '家庭记忆库' },
  { href: '/kindness', icon: Heart, label: '童忆', hint: '温暖瞬间与家庭故事' },
  { href: '/capsules', icon: Hourglass, label: '时间胶囊', hint: '写给未来' },
  { href: '/wechat-bot', icon: MessageCircle, label: '微信 Bot', hint: '扫码连接家庭群' },
  { href: '/skills', icon: GraduationCap, label: '能力', hint: '时墨的成长' },
  { href: '/interview', icon: MessagesSquare, label: '陪伴', hint: '和时墨聊聊' },
];

/**
 * SuiYan V3 Spatial Home — 空间化首页
 * ─────────────────────────────────────────────────────────────
 * 布局：左侧导航 + 中心生命核 + 右侧信息面板 + 顶部状态卡片 + 底部时间线
 *
 * 不再是座舱，而是一个悬浮在深色空间中的数字家庭控制中心。
 * 中心是粒子神经生命云，周围悬浮少量玻璃信息卡，不遮挡核心生命体。
 */
export function SpatialHome() {
  const metrics = useFamilyHubStore((state) => state.metrics);
  const shimoCore = useFamilyHubStore((state) => state.shimoCore);
  const skills = useFamilyHubStore((state) => state.skills);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const reduceMotion = useReducedMotion();

  // 将 ShimoStatus 映射为 LifeCoreState
  const lifeCoreState: LifeCoreState = useMemo(() => {
    if (shimoCore.status === 'learning') return 'learning';
    if (shimoCore.status === 'updating_memory') return 'recalling';
    if (shimoCore.status === 'thinking') return 'growing';
    return 'companion';
  }, [shimoCore.status]);

  // 四类节点数量（含童忆引擎温暖节点）
  const lifeCounts: LifeCoreCounts = useMemo(() => ({
    memory: metrics.longTermMemories,
    event: metrics.milestones + metrics.timeCapsules,
    knowledge: metrics.knowledgeDocs,
    agent: metrics.activeAgents,
    kindness: metrics.kindnessMemories ?? 0,
  }), [metrics]);

  // 新用户引导：家庭理解度与成员数均为 0 时展示三步引导卡片
  const showWelcomeGuide =
    metrics.understandingPercent === 0 && metrics.familyMembers === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setSending(true);
    // 打开浮动聊天面板，由 HomeChatOverlay 通过 SSE 发送消息并展示流式回复
    setChatMessage(value);
    setChatOpen(true);
    setMessage('');
    setSending(false);
  };

  return (
    <section className="spatial-home" aria-label="SuiYan 生命空间">
      {/* 全屏粒子星系背景层 — 固定定位填满整个视口 */}
      <div className="spatial-home__bg-particles" aria-hidden="true">
        <LifeCoreCanvas
          state={lifeCoreState}
          counts={lifeCounts}
          level={metrics.aiLevel}
          className="spatial-home__life-core spatial-home__life-core--fullscreen"
        />
      </div>

      {/* 顶部状态卡片：四个横排悬浮卡片
          使用轻量 div 替代 GlassLayer — 小卡片不需要 backdrop-filter，
          半透明背景 + 边框 + 阴影即可达到玻璃质感，大幅减少 GPU 负担 */}
      <div className="spatial-home__top-cards">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <div className="spatial-card spatial-card--compact">
            <Users size={16} />
            <div>
              <small>家庭理解度</small>
              <strong>{metrics.understandingPercent}%</strong>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="spatial-card spatial-card--compact">
            <BookOpen size={16} />
            <div>
              <small>Memory 数量</small>
              <strong>{metrics.longTermMemories}</strong>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="spatial-card spatial-card--compact">
            <TrendingUp size={16} />
            <div>
              <small>生命等级</small>
              <strong>Lv.{metrics.aiLevel}</strong>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div className="spatial-card spatial-card--compact">
            <Zap size={16} />
            <div>
              <small>掌握能力</small>
              <strong>{metrics.masteredSkills}</strong>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 左侧：家庭入口 */}
      <motion.nav
        className="spatial-home__left"
        initial={reduceMotion ? false : { opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
        aria-label="家庭入口"
      >
        <GlassLayer intensity="default" className="spatial-panel spatial-nav">
          <div className="panel-title">
            <span><Orbit size={14} /> 家庭空间</span>
            <small>{metrics.familyMembers} 位家人</small>
          </div>
          <ul className="spatial-nav__list">
            {familyEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.href}>
                  <Link href={entry.href} className="spatial-nav__item">
                    <Icon size={16} aria-hidden="true" />
                    <span>
                      <strong>{entry.label}</strong>
                      <small>{entry.hint}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </GlassLayer>
      </motion.nav>

      {/* 中心区域：保留空间用于视觉留白，粒子已在全屏背景层渲染 */}
      <div className="spatial-home__core" aria-hidden="true" />

      {/* 右侧信息面板 */}
      <aside className="spatial-home__right" aria-label="时墨状态与家庭动态">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-panel">
            <ConsciousnessPanel
              state={lifeCoreState}
              activity={shimoCore.mood ?? 73}
              className="consciousness-panel"
            />
          </GlassLayer>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-panel">
            <div className="panel-title">
              <span><BrainCircuit size={14} /> 掌握能力</span>
              <small>{metrics.masteredSkills} 项</small>
            </div>
            <div className="panel-list">
              {skills.slice(0, 5).map((skill) => (
                <div className="panel-list__row" key={skill.id}>
                  <span style={{ color: skill.color }}>●</span>
                  <span>{skill.name}</span>
                  <small>Lv.{skill.level}</small>
                </div>
              ))}
            </div>
          </GlassLayer>
        </motion.div>
      </aside>

      {/* 输入框 — 位于全局 dock 上方，留出清晰间隙
          不使用 GlassLayer 包裹（避免嵌套 glass 导致的 flex 布局和视觉割裂），
          直接用 .spatial-input-shell 类承载液态玻璃效果 */}
      <motion.form
        className="spatial-home__input"
        onSubmit={submit}
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        <div className="spatial-input-shell">
          <MessagesSquare size={16} aria-hidden="true" />
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="和时墨聊聊..."
            aria-label="和时墨对话"
          />
          <button type="submit" disabled={!message.trim() || sending} aria-label="发送消息">
            <ArrowUp size={17} />
          </button>
        </div>
      </motion.form>

      {/* 新用户引导 — 家庭理解度与成员数均为 0 时展示三步引导卡片 */}
      <WelcomeGuide
        show={showWelcomeGuide}
        onStartChat={() => {
          // 复用首页聊天浮层：空消息仅打开面板，不自动发送
          setChatMessage('');
          setChatOpen(true);
        }}
      />

      {/* 时墨浮动聊天面板 — 用户发送消息后弹出，展示流式回复 */}
      <HomeChatOverlay
        open={chatOpen}
        initialMessage={chatMessage}
        onClose={() => setChatOpen(false)}
      />
    </section>
  );
}
