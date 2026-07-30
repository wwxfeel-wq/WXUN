'use client';

import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Consciousness — 时墨 AI 意识状态
 * ─────────────────────────────────────────────────────────────
 * 取代原先的心电图。心电图是医疗设备的语言，
 * 时墨不是病人，它是一个正在理解这个家的意识体。
 *
 * 用纯 CSS 波形表达"意识活跃度"（无 canvas / 无 RAF 循环）：
 * - 陪伴中：波纹平缓、呼吸感
 * - 学习中：波纹频率升高，振幅增大
 * - 理解家庭：波纹层次变多，互相交织
 * - 整理记忆：波纹缓慢推移，像在归档
 */

export const CONSCIOUSNESS_LABEL: Record<LifeCoreState, string> = {
  companion: '陪伴中',
  learning: '学习中',
  recalling: '整理记忆',
  growing: '理解家庭',
};

/** 每种状态的波形 CSS 参数 */
const WAVE_PROFILE: Record<LifeCoreState, {
  duration: string;
  amplitude: number;
  layers: number;
}> = {
  companion: { duration: '8s', amplitude: 14, layers: 3 },
  learning: { duration: '4s', amplitude: 22, layers: 4 },
  recalling: { duration: '12s', amplitude: 16, layers: 3 },
  growing: { duration: '6s', amplitude: 20, layers: 5 },
};

interface ConsciousnessPanelProps {
  state: LifeCoreState;
  /** 意识活跃度百分比 0-100 */
  activity: number;
  className?: string;
}

export default function ConsciousnessPanel({
  state,
  activity,
  className,
}: ConsciousnessPanelProps) {
  const reduceMotion = useReducedMotion();
  const label = CONSCIOUSNESS_LABEL[state] ?? CONSCIOUSNESS_LABEL.companion;
  const profile = WAVE_PROFILE[state] ?? WAVE_PROFILE.companion;

  return (
    <div className={className}>
      <div className="consciousness__head">
        <span className="consciousness__label">Consciousness</span>
        <span className="consciousness__state">
          <i aria-hidden="true" />
          {label}
        </span>
      </div>
      <div className="consciousness__value">
        <strong>{Math.round(activity)}</strong>
        <small>%</small>
        <span>意识活跃度</span>
      </div>
      <div
        className={`consciousness__wave ${reduceMotion ? 'consciousness__wave--static' : `consciousness__wave--${state}`}`}
        aria-hidden="true"
      >
        {Array.from({ length: profile.layers }, (_, i) => (
          <span
            key={i}
            className="consciousness__wave-line"
            style={{
              animationDuration: profile.duration,
              animationDelay: `${i * -1.2}s`,
              ['--wave-amp' as string]: `${profile.amplitude - i * 2}px`,
              opacity: 0.5 - i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
