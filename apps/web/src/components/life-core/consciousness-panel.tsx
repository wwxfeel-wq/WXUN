'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Consciousness — 时墨 AI 意识状态
 * ─────────────────────────────────────────────────────────────
 * 取代原先的心电图。心电图是医疗设备的语言，
 * 时墨不是病人，它是一个正在理解这个家的意识体。
 *
 * 因此用柔和的叠加波纹表达"意识活跃度"：
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

/** 每种状态的波形参数：频率、振幅、推移速度 */
const WAVE_PROFILE: Record<LifeCoreState, { freq: number; amp: number; speed: number; layers: number }> = {
  companion: { freq: 1.1, amp: 0.34, speed: 0.010, layers: 3 },
  learning: { freq: 2.0, amp: 0.62, speed: 0.022, layers: 4 },
  recalling: { freq: 0.85, amp: 0.40, speed: 0.007, layers: 3 },
  growing: { freq: 1.5, amp: 0.52, speed: 0.015, layers: 5 },
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let t = 0;

    const render = () => {
      const profile = WAVE_PROFILE[stateRef.current] ?? WAVE_PROFILE.companion;
      const mid = height / 2;
      ctx.clearRect(0, 0, width, height);

      // 多层波纹叠加，越靠后的层越淡，形成柔和的意识流
      for (let layer = 0; layer < profile.layers; layer++) {
        const layerRatio = 1 - layer / profile.layers;
        const amp = mid * profile.amp * layerRatio;
        const freq = (profile.freq * (1 + layer * 0.42)) / width * Math.PI * 2;
        const offset = t * profile.speed * (1 + layer * 0.28);

        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
          // 两个不同周期的正弦叠加，避免机械的单一波形
          const y =
            mid +
            Math.sin(x * freq + offset) * amp * 0.7 +
            Math.sin(x * freq * 0.47 - offset * 1.3) * amp * 0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const alpha = 0.34 * layerRatio;
        ctx.strokeStyle = `rgba(0, 229, 168, ${alpha.toFixed(3)})`;
        ctx.lineWidth = layer === 0 ? 1.6 : 1;
        ctx.stroke();
      }

      t += 1;
      raf = requestAnimationFrame(render);
    };

    if (reduceMotion) {
      render();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [reduceMotion]);

  const label = CONSCIOUSNESS_LABEL[state] ?? CONSCIOUSNESS_LABEL.companion;

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
      <div className="consciousness__wave">
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </div>
  );
}
