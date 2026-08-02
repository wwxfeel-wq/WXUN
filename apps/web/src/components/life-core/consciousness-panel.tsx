'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Mood Panel — 时墨心情心电图
 * ─────────────────────────────────────────────────────────────
 * V12: 真实动态心电图 (Holter Monitor)
 * - 还原真实 PQRST 波形，符合医学标准比例
 * - 心率变异性 (HRV)：每次 R-R 间隔自然变化 ±5-10%
 * - 呼吸性窦性心律不齐 (RSA)：R 波振幅随呼吸周期微变
 * - 基线漂移：呼吸引起的缓慢基线移动
 * - 正常静息心率 60-75 BPM
 * - 滚动速度模拟真实监护仪（约 6 秒数据可见）
 * - 心情指数独立于家庭理解度，反映时墨自身的情感状态
 *
 * 参考：Wikipedia Electrocardiography
 * P 波 0.08-0.12s, PR 间期 0.12-0.20s, QRS 0.06-0.10s
 * ST 段等电位线, T 波 0.16s, QT 间期 0.36-0.44s
 */

export const CONSCIOUSNESS_LABEL: Record<LifeCoreState, string> = {
  companion: '温柔陪伴',
  learning: '好奇探索',
  recalling: '怀旧回忆',
  growing: '欣喜成长',
};

const MOOD_EMOJI: Record<LifeCoreState, string> = {
  companion: '🍃',
  learning: '✨',
  recalling: '🕯️',
  growing: '🌸',
};

const MOOD_DESC: Record<LifeCoreState, string> = {
  companion: '平静而温暖',
  learning: '充满好奇',
  recalling: '沉浸在回忆中',
  growing: '满心欢喜',
};

const MOOD_OFFSET: Record<LifeCoreState, number> = {
  companion: 0,
  learning: 8,
  recalling: -5,
  growing: 15,
};

/** V12 真实 ECG 参数 — 正常静息心率 */
const ECG_PROFILE: Record<LifeCoreState, {
  /** 静息心率 BPM — 正常范围 60-100 */
  bpm: number;
  /** HRV 强度 — R-R 间隔变异系数 */
  hrvStrength: number;
  /** 波形颜色 RGB */
  color: [number, number, number];
}> = {
  companion: {
    bpm: 65,
    hrvStrength: 0.08,
    color: [82, 196, 128],
  },
  learning: {
    bpm: 75,
    hrvStrength: 0.06,
    color: [86, 180, 233],
  },
  recalling: {
    bpm: 60,
    hrvStrength: 0.10,
    color: [230, 162, 90],
  },
  growing: {
    bpm: 72,
    hrvStrength: 0.07,
    color: [232, 134, 174],
  },
};

// ═══════════════════════════════════════════
// 伪随机数生成器
// ═══════════════════════════════════════════

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ═══════════════════════════════════════════
// 心跳时间表 — 预计算带有 HRV 的 R-R 间隔
// ═══════════════════════════════════════════

interface BeatSchedule {
  /** 每拍开始时间（秒） */
  starts: Float64Array;
  /** 每拍持续时间（秒） */
  intervals: Float64Array;
  /** 每拍 R 波振幅倍率（RSA 效应） */
  rAmps: Float64Array;
  /** 总时长覆盖 */
  totalDuration: number;
  /** 基础心率 */
  bpm: number;
}

const BEAT_COUNT = 600; // 足够覆盖 ~10 分钟

function buildBeatSchedule(bpm: number, hrvStrength: number): BeatSchedule {
  const rand = mulberry32(137);
  const meanInterval = 60 / bpm;
  const starts = new Float64Array(BEAT_COUNT);
  const intervals = new Float64Array(BEAT_COUNT);
  const rAmps = new Float64Array(BEAT_COUNT);

  let cumulative = 0;
  for (let i = 0; i < BEAT_COUNT; i++) {
    // HRV: 多频率成分模拟自主神经系统
    // 高频 (HF): 呼吸性窦性心律不齐 ~0.25 Hz
    const hf = Math.sin(i * 0.4) * hrvStrength * 0.6;
    // 低频 (LF): 血压调节 ~0.1 Hz
    const lf = Math.sin(i * 0.12) * hrvStrength * 0.3;
    // 随机噪声
    const noise = (rand() - 0.5) * hrvStrength * 0.4;

    const interval = meanInterval * (1 + hf + lf + noise);
    intervals[i] = interval;
    starts[i] = cumulative;
    cumulative += interval;

    // RSA: R 波振幅随呼吸周期变化
    const rsa = 1 + Math.sin(i * 0.4) * 0.06 + (rand() - 0.5) * 0.02;
    rAmps[i] = rsa;
  }

  return {
    starts,
    intervals,
    rAmps,
    totalDuration: cumulative,
    bpm,
  };
}

/** 二分查找：给定时间 t，返回所在的心拍索引 */
function findBeatIndex(schedule: BeatSchedule, t: number): number {
  if (t < 0) return 0;
  if (t >= schedule.totalDuration) return BEAT_COUNT - 1;

  let lo = 0, hi = BEAT_COUNT - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (schedule.starts[mid] <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// ═══════════════════════════════════════════
// PQRST 波形函数 — 医学标准比例
// ═══════════════════════════════════════════

/**
 * 单个心拍内的 ECG 波形值
 * @param phase 心拍内相位 0-1（0=心拍开始, 1=下一心拍开始）
 * @param rAmpMul R 波振幅倍率（RSA 效应）
 * @returns ECG 值（归一化，R 波峰值约 1.0）
 */
function ecgWaveform(phase: number, rAmpMul: number): number {
  // P 波 — 心房去极化，小圆弧
  // 正常：0.08-0.12s，振幅 ~0.15mV，位于心拍前 10%
  const pWave = 0.15 * Math.exp(-Math.pow((phase - 0.08) / 0.035, 2));

  // PR 段 — 等电位线（flat），0.12-0.20s
  // 无波形，自然返回 0

  // Q 波 — R 波前的小负向偏转
  const qWave = -0.08 * Math.exp(-Math.pow((phase - 0.205) / 0.006, 2));

  // R 波 — 心室去极化主峰
  // 正常 QRS 0.06-0.10s，R 波是最尖锐的部分
  const rWave = 1.0 * rAmpMul * Math.exp(-Math.pow((phase - 0.225) / 0.009, 2));

  // S 波 — R 波后的负向偏转
  const sWave = -0.18 * Math.exp(-Math.pow((phase - 0.245) / 0.007, 2));

  // ST 段 — 等电位线，0.08s
  // 无波形

  // T 波 — 心室复极化，圆弧，比 QRS 宽
  // 正常：0.16s，振幅 ~0.3mV，不对称（上升慢下降快）
  const tCenter = 0.48;
  const tWidth = phase < tCenter ? 0.05 : 0.07; // 不对称
  const tWave = 0.28 * Math.exp(-Math.pow((phase - tCenter) / tWidth, 2));

  return pWave + qWave + rWave + sWave + tWave;
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

interface ConsciousnessPanelProps {
  state: LifeCoreState;
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
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // 预计算心跳时间表
    let schedule = buildBeatSchedule(profile.bpm, profile.hrvStrength);
    const rebuildSchedule = (bpm: number, hrv: number) => {
      schedule = buildBeatSchedule(bpm, hrv);
    };
    rebuildSchedule(profile.bpm, profile.hrvStrength);

    const startTime = performance.now() / 1000;
    let lastMoodTextUpdate = 0;

    // 用于基线漂移的伪随机
    const baselineRand = mulberry32(991);

    /** 边缘羽化 */
    const featherAlpha = (xNorm: number): number => {
      const leftEdge = 0.05;
      const rightEdge = 0.95;
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

      // 如果心率参数变化，重建时间表
      if (schedule.bpm !== p.bpm) {
        rebuildSchedule(p.bpm, p.hrvStrength);
      }

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;

      // 心情值 — 仅用于数字显示
      const mood = clamp(act + mo, 0, 100);
      displayMoodRef.current = mood;
      if (now - lastMoodTextUpdate > 1.5 && moodStrongRef.current) {
        lastMoodTextUpdate = now;
        moodStrongRef.current.textContent = String(Math.round(mood));
      }

      // ═══ V12: 真实动态心电图 ═══

      // 滚动速度 — 约 6 秒数据可见（模拟监护仪）
      const scrollSpeed = W / 6.0;

      // 振幅 — R 波约占画布高度的 35%
      const ampScale = H * 0.35;

      // 采样数 — 高密度保证 QRS 尖锐
      const samples = Math.max(200, Math.floor(W / 1.5));
      const points: { x: number; y: number; alpha: number }[] = [];

      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const xNorm = i / samples;

        // 时间映射：右端是当前时间，左端是过去
        const timeAtX = t - (1 - xNorm) * (W / scrollSpeed);

        // 找到当前时间所在的心拍
        const beatIdx = findBeatIndex(schedule, timeAtX);
        const beatStart = schedule.starts[beatIdx];
        const beatInterval = schedule.intervals[beatIdx];
        const rAmpMul = schedule.rAmps[beatIdx];

        // 心拍内相位 0-1
        const phase = clamp((timeAtX - beatStart) / beatInterval, 0, 1);

        // PQRST 波形
        const ecgVal = ecgWaveform(phase, rAmpMul);

        // 基线漂移 — 呼吸引起的缓慢移动
        const baselineWander =
          Math.sin(timeAtX * 0.25) * 0.025 +
          Math.sin(timeAtX * 0.11) * 0.015;

        // 微弱噪声 — 真实电极不可能完全干净
        const noise = (baselineRand() - 0.5) * 0.008;

        // 边缘羽化
        const edgeFade = featherAlpha(xNorm);

        const y = cy - (ecgVal + baselineWander + noise) * ampScale * edgeFade;
        points.push({ x, y, alpha: edgeFade });
      }

      const [lr, lg, lb] = p.color;

      // ═══ 1. 基线 — 淡虚线 ═══
      const axisGrad = ctx.createLinearGradient(0, 0, W, 0);
      axisGrad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      axisGrad.addColorStop(0.05, `rgba(${lr}, ${lg}, ${lb}, 0.05)`);
      axisGrad.addColorStop(0.95, `rgba(${lr}, ${lg}, ${lb}, 0.05)`);
      axisGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      ctx.beginPath();
      ctx.strokeStyle = axisGrad;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 5]);
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // ═══ 2. ECG 波形 — 光晕 + 主线 ═══
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 2a. 外层光晕
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.08)`;
      ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, 0.25)`;
      ctx.shadowBlur = 6;
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
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 3;
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const segAlpha = (p0.alpha + p1.alpha) / 2 * 0.75;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha})`;
        ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha * 0.4})`;
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
          lastPoint.x, lastPoint.y, 7,
        );
        dotGrad.addColorStop(0, `rgba(255, 255, 255, 0.7)`);
        dotGrad.addColorStop(0.3, `rgba(${lr}, ${lg}, ${lb}, 0.35)`);
        dotGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // 30fps — 流畅但不浪费
    let lastDraw = 0;
    const frameInterval = 1000 / 30;
    const loop = (now: number) => {
      if (now - lastDraw >= frameInterval) {
        lastDraw = now;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const moodInterval = setInterval(() => {
      setDisplayMood(displayMoodRef.current);
    }, 3000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearInterval(moodInterval);
    };
  }, [reduceMotion, profile.bpm, profile.hrvStrength]);

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
