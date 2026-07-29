'use client';

import { FormEvent, useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowUp,
  BookOpen,
  BrainCircuit,
  GraduationCap,
  Hourglass,
  Landmark,
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
import { useFamilyHubStore, type TimelineEntry } from '@/stores/family-hub-store';

function timelineIcon(type: TimelineEntry['type']) {
  if (type === 'memory') return BookOpen;
  if (type === 'skill') return Sparkles;
  if (type === 'agent') return BrainCircuit;
  return Activity;
}

/** 左侧家庭入口：进入家庭空间的六个方向 */
const familyEntries = [
  { href: '/family', icon: Users, label: '家人', hint: '成员与关系' },
  { href: '/interview', icon: MessagesSquare, label: '陪伴', hint: '和时墨聊聊' },
  { href: '/center', icon: Sparkles, label: '回忆', hint: '家庭记忆库' },
  { href: '/capsules', icon: Hourglass, label: '时间胶囊', hint: '写给未来' },
  { href: '/museum', icon: Landmark, label: '家庭博物馆', hint: '珍藏时刻' },
  { href: '/skills', icon: GraduationCap, label: '能力', hint: '时墨的成长' },
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
  const timeline = useFamilyHubStore((state) => state.timeline);
  const invokeAgent = useFamilyHubStore((state) => state.invokeAgent);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const reduceMotion = useReducedMotion();

  // 将 ShimoStatus 映射为 LifeCoreState
  const lifeCoreState: LifeCoreState = useMemo(() => {
    if (shimoCore.status === 'learning') return 'learning';
    if (shimoCore.status === 'updating_memory') return 'recalling';
    if (shimoCore.status === 'thinking') return 'growing';
    return 'companion';
  }, [shimoCore.status]);

  // 四类节点数量
  const lifeCounts: LifeCoreCounts = useMemo(() => ({
    memory: metrics.longTermMemories,
    event: metrics.milestones + metrics.timeCapsules,
    knowledge: metrics.knowledgeDocs,
    agent: metrics.activeAgents,
  }), [metrics]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await invokeAgent('life', value);
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="spatial-home" aria-label="SuiYan 生命空间">
      {/* 深蓝黑空间背景 */}
      <div className="spatial-home__canvas" aria-hidden="true" />

      {/* 顶部状态卡片：四个横排悬浮卡片 */}
      <div className="spatial-home__top-cards">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-card spatial-card--compact">
            <Users size={16} />
            <div>
              <small>家庭理解度</small>
              <strong>{metrics.understandingPercent}%</strong>
            </div>
          </GlassLayer>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-card spatial-card--compact">
            <BookOpen size={16} />
            <div>
              <small>Memory 数量</small>
              <strong>{metrics.longTermMemories}</strong>
            </div>
          </GlassLayer>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-card spatial-card--compact">
            <TrendingUp size={16} />
            <div>
              <small>生命等级</small>
              <strong>Lv.{metrics.aiLevel}</strong>
            </div>
          </GlassLayer>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <GlassLayer intensity="default" className="spatial-card spatial-card--compact">
            <Zap size={16} />
            <div>
              <small>掌握能力</small>
              <strong>{metrics.masteredSkills}</strong>
            </div>
          </GlassLayer>
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
        <GlassLayer intensity="strong" className="spatial-panel spatial-nav">
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

      {/* 中心：粒子神经生命云 */}
      <motion.div
        className="spatial-home__core"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        aria-label="SuiYan Life Core 神经生命云"
      >
        <LifeCoreCanvas
          state={lifeCoreState}
          counts={lifeCounts}
          level={metrics.aiLevel}
          className="spatial-home__life-core"
        />
      </motion.div>

      {/* 右侧信息面板 */}
      <aside className="spatial-home__right" aria-label="时墨状态与家庭动态">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <GlassLayer intensity="strong" className="spatial-panel">
            <ConsciousnessPanel
              state={lifeCoreState}
              activity={shimoCore.understanding}
              className="consciousness-panel"
            />
          </GlassLayer>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <GlassLayer intensity="strong" className="spatial-panel">
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

      {/* 底部时间线 */}
      <motion.footer
        className="spatial-home__bottom"
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        aria-label="近期动态"
      >
        <GlassLayer intensity="default" className="spatial-timeline">
          <div className="timeline-header">
            <Activity size={14} />
            <span>近期动态</span>
          </div>
          <div className="timeline-list">
            {timeline.slice(0, 4).map((item) => {
              const Icon = timelineIcon(item.type);
              return (
                <div className="timeline-item" key={item.id}>
                  <Icon size={14} />
                  <div>
                    <span>{item.title}</span>
                    <small>{item.detail}</small>
                  </div>
                  <time>{item.date}</time>
                </div>
              );
            })}
          </div>
        </GlassLayer>
      </motion.footer>

      {/* 输入框 */}
      <motion.form
        className="spatial-home__input"
        onSubmit={submit}
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        <GlassLayer intensity="strong" className="spatial-input-shell">
          <MessageCircle size={16} aria-hidden="true" />
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="和时墨聊聊..."
            aria-label="和时墨对话"
          />
          <button type="submit" disabled={!message.trim() || sending} aria-label="发送消息">
            <ArrowUp size={17} />
          </button>
        </GlassLayer>
      </motion.form>
    </section>
  );
}
