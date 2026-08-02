'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Mood Panel — 时墨心情心电图
 * ─────────────────────────────────────────────────────────────
 * V10: 极简心电图 — 一条平线，偶尔一个心跳
 * - 去掉所有噪声层（肌电噪声、HRV、呼吸基线漂移、情绪事件）
 * - 去掉 P 波、T 波、Q/S 波 — 只保留 R 波尖峰
 * - BPM 极低（companion 22, learning 28, recalling 18, growing 24）
 * - 滚动速度极慢 W*0.004
 * - 帧率 8fps — 几乎静止
 * - 90%+ 是完全平坦的基线，只有偶尔一个尖峰脉冲
 * - 心情指数独立于家庭理解度，反映时墨自身的情感状态
 */

export const CONSCIOUSNESS_LABEL: Record<LifeCoreState, string> = {
  companion: '温柔陪伴',
  learning: '好奇探索',
  recalling: '怀旧回忆',
  growing: '欣喜成长',
};

/** 心情表情符号 */
const MOOD_EMOJI: Record<LifeCoreState, string> = {
  companion: '🍃',
  learning: '✨',
  recalling: '🕯️',
  growing: '🌸',
};

/** 每种心情的简短描述 */
const MOOD_DESC: Record<LifeCoreState, string> = {
  companion: '平静而温暖',
  learning: '充满好奇',
  recalling: '沉浸在回忆中',
  growing: '满心欢喜',
};

/** 心情状态对基础心情值的偏移 */
const MOOD_OFFSET: Record<LifeCoreState, number> = {
  companion: 0,
  learning: 8,
  recalling: -5,
  growing: 15,
};

/** V10 极简 ECG 参数 — 只有一个 R 波尖峰 */
const ECG_PROFILE: Record<LifeCoreState, {
  /** 心率 BPM — 极低，3 秒一个心跳 */
  bpm: number;
  /** R 波振幅 */
  rAmp: number;
  /** R 波宽度 — 极窄 */
  rWidth: number;
  /** R 波在周期中的位置 — 前端，后面全是平线 */
  rCenter: number;
  /** 波形颜色 RGB */
  color: [number, number, number];
}> = {
  companion: {
    bpm: 22, rAmp: 1.2, rWidth: 0.003, rCenter: 0.08,
    color: [82, 196, 128],
  },
  learning: {
    bpm: 28, rAmp: 1.4, rWidth: 0.0025, rCenter: 0.08,
    color: [86, 180, 233],
  },
  recalling: {
    bpm: 18, rAmp: 1.0, rWidth: 0.0035, rCenter: 0.08,
    color: [230, 162, 90],
  },
  growing: {
    bpm: 24, rAmp: 1.3, rWidth: 0.003, rCenter: 0.08,
    color: [232, 134, 174],
  },
};

type EcgProfile = typeof ECG_PROFILE[LifeCoreState];

/** V10: 只计算 R 波 — 其余全部返回 0（平坦基线） */
function ecgPulse(phase: number, p: EcgProfile): number {
  // R 波 — 尖锐主峰，极窄
  return p.rAmp * Math.exp(-Math.pow((phase - p.rCenter) / p.rWidth, 2));
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

interface ConsciousnessPanelProps {
  state: LifeCoreState;
  /** 基础心情指数 0-100（来自 store shimoCore.mood） */
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
  const emoji = MOOD_EMOJI[state] ?? MOOD_EMOJI.companion;
  const desc = MOOD_DESC[state] ?? MOOD_DESC.companion;
  const profile = ECG_PROFILE[state] ?? ECG_PROFILE.companion;
  const moodOffset = MOOD_OFFSET[state] ?? 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef({ state, activity, profile, moodOffset });
  stateRef.current = { state, activity, profile, moodOffset };

  // 显示用心情值
  const [displayMood, setDisplayMood] = useState(() => clamp(activity + moodOffset, 0, 100));
  const displayMoodRef = useRef(displayMood);
  const moodStrongRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, DPR = 1;
    const resize = () => {
      DPR = window.devicePixelRatio || 1;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const startTime = performance.now() / 1000;
    let lastMoodTextUpdate = 0;

    /** 边缘羽化 */
    const featherAlpha = (xNorm: number): number => {
      const leftEdge = 0.06;
      const rightEdge = 0.94;
      if (xNorm < leftEdge) {
        return Math.sin((xNorm / leftEdge) * Math.PI * 0.5);
      }
      if (xNorm > rightEdge) {
        return Math.sin(((1.0 - xNorm) / (1.0 - rightEdge)) * Math.PI * 0.5);
      }
      return 1;
    };

    const draw = () => {
      const now = performance.now() / 1000;
      const t = reduceMotion ? 0 : now - startTime;
      const { profile: p, activity: act, moodOffset: mo } = stateRef.current;

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;

      // ═══ 心情值 — 仅用于数字显示，不再影响波形 ═══
      const mood = clamp(act + mo, 0, 100);
      displayMoodRef.current = mood;

      if (now - lastMoodTextUpdate > 1.5 && moodStrongRef.current) {
        lastMoodTextUpdate = now;
        moodStrongRef.current.textContent = String(Math.round(mood));
      }

      // ═══ V10: 极简波形 — 只有一条平线 + R 波尖峰 ═══
      const beatDuration = 60 / p.bpm;

      // 滚动速度 — 极慢
      const scrollSpeed = W * 0.004;

      // 振幅
      const ampScale = H * 0.38;

      // 采样
      const samples = Math.max(100, Math.floor(W / 2));
      const points: { x: number; y: number; alpha: number }[] = [];

      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const xNorm = i / samples;

        // 时间映射
        const timeAtX = t - (1 - xNorm) * (W / scrollSpeed);

        // 心动周期相位
        const phase = ((timeAtX / beatDuration) % 1 + 1) % 1;

        // V10: 只有 R 波，其余全是 0
        const ecgVal = ecgPulse(phase, p);

        // 边缘羽化
        const edgeFade = featherAlpha(xNorm);

        const y = cy - ecgVal * ampScale * edgeFade;
        points.push({ x, y, alpha: edgeFade });
      }

      const [lr, lg, lb] = p.color;

      // ═══ 1. 基线 — 淡虚线 ═══
      const axisGrad = ctx.createLinearGradient(0, 0, W, 0);
      axisGrad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      axisGrad.addColorStop(0.06, `rgba(${lr}, ${lg}, ${lb}, 0.06)`);
      axisGrad.addColorStop(0.94, `rgba(${lr}, ${lg}, ${lb}, 0.06)`);
      axisGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      ctx.beginPath();
      ctx.strokeStyle = axisGrad;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 5]);
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // ═══ 2. ECG 波形 — 两层（光晕 + 主线） ═══
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 2a. 外层光晕
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.06)`;
      ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, 0.2)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) {
          ctx.moveTo(points[i].x, points[i].y);
        } else {
          const prev = points[i - 1];
          const curr = points[i];
          const xc = (prev.x + curr.x) / 2;
          const yc = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, xc, yc);
        }
      }
      ctx.stroke();

      // 2b. 主线 — 分段渲染支持羽化
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 4;
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const segAlpha = (p0.alpha + p1.alpha) / 2 * 0.7;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha})`;
        ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha * 0.5})`;
        if (i < points.length - 1) {
          const p2 = points[i + 1];
          const xc = (p1.x + p2.x) / 2;
          const yc = (p1.y + p2.y) / 2;
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(p1.x, p1.y, xc, yc);
        } else {
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // ═══ 3. 当前位置扫描亮点 ═══
      const lastPoint = points[points.length - 1];
      if (lastPoint && lastPoint.alpha > 0.1) {
        const dotGrad = ctx.createRadialGradient(
          lastPoint.x, lastPoint.y, 0,
          lastPoint.x, lastPoint.y, 8,
        );
        dotGrad.addColorStop(0, `rgba(255, 255, 255, 0.8)`);
        dotGrad.addColorStop(0.3, `rgba(${lr}, ${lg}, ${lb}, 0.4)`);
        dotGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // 8fps — 极慢节奏
    let lastDraw = 0;
    const frameInterval = 1000 / 8;
    const loop = (now: number) => {
      if (now - lastDraw >= frameInterval) {
        lastDraw = now;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // 每 3 秒同步心情数字
    const moodInterval = setInterval(() => {
      setDisplayMood(displayMoodRef.current);
    }, 3000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearInterval(moodInterval);
    };
  }, [reduceMotion]);

  return (
    <div className={className}>
      <div className="consciousness__head">
        <span className="consciousness__label">Mood</span>
        <span className="consciousness__state">
          <i aria-hidden="true" />
          {label}
        </span>
      </div>
      <div className="consciousness__value">
        <span className="consciousness__emoji" aria-hidden="true">{emoji}</span>
        <strong ref={moodStrongRef}>{Math.round(displayMood)}</strong>
        <small>%</small>
        <span>心情指数</span>
      </div>
      <div className="consciousness__mood-desc">{desc}</div>
      <div className="consciousness__wave-container">
        <canvas
          ref={canvasRef}
          className="consciousness__wave-canvas"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
