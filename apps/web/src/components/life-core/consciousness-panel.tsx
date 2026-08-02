'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Mood Panel — 时墨心情心电图
 * ─────────────────────────────────────────────────────────────
 * V15: 极端随机动态心电图
 *
 * 核心变化（vs V14）：
 * 1. R 波振幅 0.48-0.65 → 0.25-1.15（4.6 倍范围，有些拍矮有些拍高）
 * 2. R-R 间隔 0.65x-1.5x → 0.4x-2.2x（有时很密、有时很开）
 * 3. 15% 概率"快拍"（短间隔）+ 12% 概率"长停顿"
 * 4. R 波余弦半宽 0.055-0.085 → 0.07-0.13（更圆润）
 * 5. T 波振幅 0.08-0.14 → 0.04-0.28（大范围随机）
 * 6. P 波有时有有时无（40% 概率消失）
 * 7. 可见窗口 14 秒，BPM 48-55
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

const ECG_PROFILE: Record<LifeCoreState, {
  bpm: number;
  hrvStrength: number;
  color: [number, number, number];
}> = {
  companion: { bpm: 50, hrvStrength: 0.60, color: [82, 196, 128] },
  learning: { bpm: 54, hrvStrength: 0.55, color: [86, 180, 233] },
  recalling: { bpm: 48, hrvStrength: 0.65, color: [230, 162, 90] },
  growing: { bpm: 52, hrvStrength: 0.58, color: [232, 134, 174] },
};

// ═══════════════════════════════════════════
// 伪随机 — 种子用时间，每次刷新不同
// ═══════════════════════════════════════════

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 高斯随机（Box-Muller） */
function gaussianRandom(rand: () => number): number {
  const u = Math.max(1e-10, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ═══════════════════════════════════════════
// 心拍参数 — 每拍独立的形态参数
// ═══════════════════════════════════════════

interface BeatParams {
  start: number;
  duration: number;
  // R 波 — 余弦钟形，圆润宽顶
  rAmp: number;
  rCenter: number;
  rHalfWidth: number;
  // T 波 — 柔和不对称
  tAmp: number;
  tCenter: number;
  tWidthUp: number;
  tWidthDown: number;
  // P 波 — 极淡
  pAmp: number;
  pCenter: number;
  pWidth: number;
  // Q/S 波 — 微小切迹
  qAmp: number;
  qCenter: number;
  qWidth: number;
  sAmp: number;
  sCenter: number;
  sWidth: number;
}

interface BeatSchedule {
  beats: BeatParams[];
  starts: Float64Array;
  totalDuration: number;
  bpm: number;
}

const BEAT_COUNT = 400;

function buildBeatSchedule(bpm: number, hrvStrength: number): BeatSchedule {
  // 种子用时间 + 随机 → 每次刷新完全不同
  const seed = (Date.now() ^ (Math.random() * 1e9 | 0)) >>> 0;
  const rand = mulberry32(seed);
  const meanInterval = 60 / bpm;
  const beats: BeatParams[] = [];
  const starts = new Float64Array(BEAT_COUNT);

  let cumulative = 0;
  let prevInterval = meanInterval;

  for (let i = 0; i < BEAT_COUNT; i++) {
    // ═══ V15: 极端随机 R-R 间隔 ═══
    const randomStep = gaussianRandom(rand) * hrvStrength * meanInterval * 0.6;
    const meanReversion = (meanInterval - prevInterval) * 0.03;
    let interval = prevInterval + randomStep + meanReversion;
    // 钳制范围极大 → 允许 0.4x 到 2.2x 变化
    interval = clamp(interval, meanInterval * 0.4, meanInterval * 2.2);

    // 15% 概率"快拍" — 两个心跳挨得很近
    if (rand() < 0.15) {
      interval *= 0.45 + rand() * 0.2; // 0.45x-0.65x
    }
    // 12% 概率"长停顿" — 两个心跳隔得很远
    else if (rand() < 0.12) {
      interval *= 1.6 + rand() * 0.5; // 1.6x-2.1x
    }

    prevInterval = interval;
    starts[i] = cumulative;

    const beatDuration = interval;

    // ═══ V15: 极端形态随机 ═══
    // R 波 — 振幅 4.6 倍范围（有些拍矮、有些拍高）
    const rAmp = 0.25 + rand() * 0.9; // 0.25-1.15
    // R 波 — 余弦半宽，宽顶圆润
    const rHalfWidth = 0.07 + rand() * 0.06; // 0.07-0.13

    // P 波 — 40% 概率消失，60% 概率有
    const hasP = rand() > 0.4;

    // T 波 — 大范围随机振幅
    const tAmp = 0.04 + rand() * 0.24; // 0.04-0.28

    beats.push({
      start: cumulative,
      duration: beatDuration,
      // R 波
      rAmp,
      rCenter: 0.19 + rand() * 0.03,
      rHalfWidth,
      // T 波 — 柔和不对称
      tAmp,
      tCenter: 0.46 + rand() * 0.12,
      tWidthUp: 0.05 + rand() * 0.04,
      tWidthDown: 0.08 + rand() * 0.05,
      // P 波 — 有时有有时无
      pAmp: hasP ? (0.02 + rand() * 0.06) : 0, // 0 或 0.02-0.08
      pCenter: 0.08 + rand() * 0.03,
      pWidth: 0.03 + rand() * 0.02,
      // Q 波 — 微小切迹
      qAmp: -(0.01 + rand() * 0.03), // -0.01 to -0.04
      qCenter: 0.16 + rand() * 0.02,
      qWidth: 0.018 + rand() * 0.012,
      // S 波 — 微小切迹
      sAmp: -(0.015 + rand() * 0.04), // -0.015 to -0.055
      sCenter: 0.24 + rand() * 0.025,
      sWidth: 0.022 + rand() * 0.018,
    });

    cumulative += interval;
  }

  return { beats, starts, totalDuration: cumulative, bpm };
}

/** 二分查找心拍索引 */
function findBeatIndex(schedule: BeatSchedule, t: number): number {
  if (t < 0) return 0;
  if (t >= schedule.totalDuration) return BEAT_COUNT - 1;
  let lo = 0, hi = BEAT_COUNT - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (schedule.starts[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * 单拍 ECG 波形 — V14
 * R 波用余弦钟形：0.5*(1+cos(π*d/hw))，圆润宽顶
 * 其余波用高斯，振幅极低
 */
function ecgWaveform(phase: number, b: BeatParams): number {
  // P 波 — 极淡高斯
  const pWave = b.pAmp * Math.exp(-Math.pow((phase - b.pCenter) / b.pWidth, 2));
  // Q 波 — 微小
  const qWave = b.qAmp * Math.exp(-Math.pow((phase - b.qCenter) / b.qWidth, 2));
  // R 波 — 余弦钟形（圆润宽顶，不尖锐）
  const rDist = Math.abs(phase - b.rCenter);
  let rWave = 0;
  if (rDist < b.rHalfWidth) {
    rWave = b.rAmp * 0.5 * (1 + Math.cos(Math.PI * rDist / b.rHalfWidth));
  }
  // S 波 — 微小
  const sWave = b.sAmp * Math.exp(-Math.pow((phase - b.sCenter) / b.sWidth, 2));
  // T 波 — 不对称高斯
  const tWidth = phase < b.tCenter ? b.tWidthUp : b.tWidthDown;
  const tWave = b.tAmp * Math.exp(-Math.pow((phase - b.tCenter) / tWidth, 2));
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

    let schedule = buildBeatSchedule(profile.bpm, profile.hrvStrength);

    const startTime = performance.now() / 1000;
    let lastMoodTextUpdate = 0;
    const noiseSeed = (Math.random() * 1e6 | 0) + 1;
    const noiseRand = mulberry32(noiseSeed);

    /** 边缘羽化 */
    const featherAlpha = (xNorm: number): number => {
      const leftEdge = 0.05;
      const rightEdge = 0.95;
      if (xNorm < leftEdge) return Math.sin((xNorm / leftEdge) * Math.PI * 0.5);
      if (xNorm > rightEdge) return Math.sin(((1.0 - xNorm) / (1.0 - rightEdge)) * Math.PI * 0.5);
      return 1;
    };

    const draw = () => {
      const now = performance.now() / 1000;
      const t = reduceMotion ? 0 : now - startTime;
      const { profile: p, activity: act, moodOffset: mo } = stateRef.current;

      if (schedule.bpm !== p.bpm) {
        schedule = buildBeatSchedule(p.bpm, p.hrvStrength);
      }

      ctx.clearRect(0, 0, W, H);
      const cy = H / 2;

      const mood = clamp(act + mo, 0, 100);
      displayMoodRef.current = mood;
      if (now - lastMoodTextUpdate > 1.5 && moodStrongRef.current) {
        lastMoodTextUpdate = now;
        moodStrongRef.current.textContent = String(Math.round(mood));
      }

      // ═══ V15: 极端随机动态心电图 ═══
      // 14 秒数据可见 — 更少心跳，更从容
      const scrollSpeed = W / 14.0;
      const ampScale = H * 0.28; // 振幅放大，配合大范围 R 波
      const samples = Math.max(300, Math.floor(W / 1.5));
      const points: { x: number; y: number; alpha: number }[] = [];

      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const xNorm = i / samples;
        const timeAtX = t - (1 - xNorm) * (W / scrollSpeed);

        const beatIdx = findBeatIndex(schedule, timeAtX);
        const beat = schedule.beats[beatIdx];
        const phase = clamp((timeAtX - beat.start) / beat.duration, 0, 1);

        const ecgVal = ecgWaveform(phase, beat);

        // 基线漂移 — 低频随机
        const baselineWander =
          Math.sin(timeAtX * 0.12) * 0.015 +
          Math.sin(timeAtX * 0.05 + 1.3) * 0.008;

        // 电极噪声 — 很低
        const noise = (noiseRand() - 0.5) * 0.008;

        const edgeFade = featherAlpha(xNorm);
        const y = cy - (ecgVal + baselineWander + noise) * ampScale * edgeFade;
        points.push({ x, y, alpha: edgeFade });
      }

      const [lr, lg, lb] = p.color;

      // 基线
      const axisGrad = ctx.createLinearGradient(0, 0, W, 0);
      axisGrad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      axisGrad.addColorStop(0.05, `rgba(${lr}, ${lg}, ${lb}, 0.04)`);
      axisGrad.addColorStop(0.95, `rgba(${lr}, ${lg}, ${lb}, 0.04)`);
      axisGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      ctx.beginPath();
      ctx.strokeStyle = axisGrad;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 5]);
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // ECG 波形
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 光晕层
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.06)`;
      ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, 0.15)`;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else {
          const prev = points[i - 1];
          const curr = points[i];
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        }
      }
      ctx.stroke();

      // 主线
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 2;
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const segAlpha = (p0.alpha + p1.alpha) / 2 * 0.75;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha})`;
        ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha * 0.3})`;
        if (i < points.length - 1) {
          const p2 = points[i + 1];
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        } else {
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // 扫描亮点
      const lastPoint = points[points.length - 1];
      if (lastPoint && lastPoint.alpha > 0.1) {
        const dotGrad = ctx.createRadialGradient(
          lastPoint.x, lastPoint.y, 0, lastPoint.x, lastPoint.y, 6,
        );
        dotGrad.addColorStop(0, `rgba(255, 255, 255, 0.6)`);
        dotGrad.addColorStop(0.3, `rgba(${lr}, ${lg}, ${lb}, 0.3)`);
        dotGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

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
