'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Mood Panel — 时墨心情心电图
 * ─────────────────────────────────────────────────────────────
 * V7: 真实心电图节奏 — 大段平坦基线 + 瞬间心跳脉冲
 *
 * 波形图以真实心电图形式呈现时墨当前的心情：
 * - 温柔陪伴：52 BPM（温柔、安定）
 * - 好奇探索：65 BPM（好奇、轻快）
 * - 怀旧回忆：45 BPM（怀念、沉浸）
 * - 欣喜成长：58 BPM（欣喜、温暖）
 *
 * 真实 ECG 的 90% 是平坦基线，只在心跳瞬间有尖锐的 P-QRS-T 脉冲。
 * P 波极小，R 波尖锐狭窄，T 波柔和 — 不再是密集的正弦波。
 * 心情指数独立于家庭理解度，反映时墨自身的情感状态。
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

/** 心情状态对基础心情值的偏移 — 不同状态下时墨心情不同 */
const MOOD_OFFSET: Record<LifeCoreState, number> = {
  companion: 0,
  learning: 8,
  recalling: -5,
  growing: 15,
};

/** ECG 波形参数 — 每种心情对应不同心率与波形形态
 *  V7: 真实心电图节奏 — 大段平坦基线 + 瞬间心跳脉冲
 *  真实 ECG 的 90% 是平坦基线，只在 R 波瞬间有尖锐脉冲 */
const ECG_PROFILE: Record<LifeCoreState, {
  /** 心率 BPM */
  bpm: number;
  /** R 波振幅 (0-1) — 主峰高度 */
  rAmp: number;
  /** P 波振幅 — 很小的心房波 */
  pAmp: number;
  /** T 波振幅 — 心室复极化 */
  tAmp: number;
  /** P 波中心位置 (0-1 心动周期内) */
  pCenter: number;
  /** P 波宽度 — 很窄 */
  pWidth: number;
  /** R 波中心位置 */
  rCenter: number;
  /** R 波宽度 — 极窄，模拟真实 QRS 尖峰 */
  rWidth: number;
  /** T 波中心位置 */
  tCenter: number;
  /** T 波宽度 — 中等 */
  tWidth: number;
  /** 波形颜色 RGB */
  color: [number, number, number];
}> = {
  companion: {
    bpm: 52, rAmp: 1.3, pAmp: 0.12, tAmp: 0.35,
    pCenter: 0.20, pWidth: 0.020, rCenter: 0.28, rWidth: 0.004, tCenter: 0.42, tWidth: 0.035,
    color: [82, 196, 128],
  },
  learning: {
    bpm: 65, rAmp: 1.5, pAmp: 0.14, tAmp: 0.40,
    pCenter: 0.18, pWidth: 0.018, rCenter: 0.26, rWidth: 0.0035, tCenter: 0.40, tWidth: 0.030,
    color: [86, 180, 233],
  },
  recalling: {
    bpm: 45, rAmp: 1.1, pAmp: 0.10, tAmp: 0.30,
    pCenter: 0.22, pWidth: 0.025, rCenter: 0.30, rWidth: 0.005, tCenter: 0.46, tWidth: 0.045,
    color: [230, 162, 90],
  },
  growing: {
    bpm: 58, rAmp: 1.4, pAmp: 0.13, tAmp: 0.38,
    pCenter: 0.19, pWidth: 0.020, rCenter: 0.27, rWidth: 0.004, tCenter: 0.41, tWidth: 0.032,
    color: [232, 134, 174],
  },
};

type EcgProfile = typeof ECG_PROFILE[LifeCoreState];

/** 计算 ECG 复合波在某相位上的值 — 真实心电图节奏
 *  大部分相位返回 0（平坦基线），只在 P-R-T 附近有波动 */
function ecgComplex(phase: number, p: EcgProfile): number {
  // P 波 — 心房去极化（很小很窄的圆弧）
  const pWave = p.pAmp * Math.exp(-Math.pow((phase - p.pCenter) / p.pWidth, 2));
  // Q 波 — R 波前的微小负向偏转（极小）
  const qWave = -p.rAmp * 0.04 * Math.exp(-Math.pow((phase - (p.rCenter - 0.008)) / 0.004, 2));
  // R 波 — 尖锐主峰（极窄，模拟真实 QRS）
  const rWave = p.rAmp * Math.exp(-Math.pow((phase - p.rCenter) / p.rWidth, 2));
  // S 波 — R 波后的负向偏转（小）
  const sWave = -p.rAmp * 0.08 * Math.exp(-Math.pow((phase - (p.rCenter + 0.008)) / 0.006, 2));
  // T 波 — 心室复极化（中等圆弧，远小于之前）
  const tWave = p.tAmp * Math.exp(-Math.pow((phase - p.tCenter) / p.tWidth, 2));
  return pWave + qWave + rWave + sWave + tWave;
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

  // 显示用心情值 — 独立更新避免高频 re-render
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

    // 多频段噪声种子 — 模拟 Perlin 噪声的有机感
    const noiseSeed = Array.from({ length: 64 }, () => Math.random() * 1000);
    // 情绪事件种子 — 随机的情感波动事件
    const eventSeed = Array.from({ length: 8 }, () => ({
      time: Math.random() * 15,
      intensity: 0.3 + Math.random() * 0.5,
      duration: 2 + Math.random() * 3,
      freq: 0.5 + Math.random() * 1.5,
    }));

    const startTime = performance.now() / 1000;
    let lastMoodTextUpdate = 0;

    /** 多频段噪声 — 模拟 Perlin 噪声的有机起伏 */
    const organicNoise = (x: number, t: number, seed: number): number => {
      const n1 = Math.sin(x * 1.3 + t * 0.7 + seed) * 0.5;
      const n2 = Math.sin(x * 2.7 + t * 1.1 + seed * 1.7) * 0.3;
      const n3 = Math.sin(x * 5.1 + t * 1.9 + seed * 2.3) * 0.15;
      return n1 + n2 + n3;
    };

    /** 边缘羽化函数 — 两边平滑淡出 */
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

    /** 情绪事件 — 偶发的情感波动 */
    const moodEvent = (t: number): number => {
      let sum = 0;
      for (const evt of eventSeed) {
        const cycle = 12 + evt.duration * 3;
        const phase = (t % cycle) - evt.time;
        if (phase > 0 && phase < evt.duration) {
          const env = Math.sin((phase / evt.duration) * Math.PI);
          sum += env * evt.intensity * Math.sin(t * evt.freq * Math.PI * 2);
        }
      }
      return sum;
    };

    const draw = () => {
      const now = performance.now() / 1000;
      // prefers-reduced-motion 时冻结时间 — 波形静止展示，不做滚动/呼吸动画
      const t = reduceMotion ? 0 : now - startTime;
      const { state: lifeState, profile: p, activity: act, moodOffset: mo } = stateRef.current;

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;

      // ═══ 时墨真实心情 = 基础值 + 状态偏移 + 有机波动 + 情绪事件 ═══
      const slowMood = organicNoise(t * 0.12, t * 0.08, noiseSeed[0]);
      const eventBoost = moodEvent(t);
      const rawMood = act + mo + slowMood * 6 + eventBoost * 4;
      const mood = clamp(rawMood, 0, 100);
      displayMoodRef.current = mood;

      // 每 800ms 更新 DOM 心情数字 — 更慢更沉稳
      if (now - lastMoodTextUpdate > 0.8 && moodStrongRef.current) {
        lastMoodTextUpdate = now;
        moodStrongRef.current.textContent = String(Math.round(mood));
      }

      const actNorm = mood / 100;

      // 心率 — 随心情微调 + 情绪事件回流加成（让 moodEvent 影响瞬时心率）
      const bpm = p.bpm * (0.95 + actNorm * 0.10 + eventBoost * 0.08);
      const beatDuration = 60 / bpm;

      // 滚动速度 — 像素/秒，降速 50% 让视觉节奏更从容，贴近真实心电图纸
      const scrollSpeed = W * 0.025;

      // 呼吸感叠加 — 双频叠加 + 心情状态调制，避免单一频率的机械规律
      const breathCycle1 = 5.5;
      const breathCycle2 = 7.3;
      const breathWave = Math.sin((t / breathCycle1) * Math.PI * 2) * 0.035
        + Math.sin((t / breathCycle2) * Math.PI * 2 + 1.3) * 0.018;
      const breathScale = lifeState === 'recalling' ? 1.3 : lifeState === 'learning' ? 0.8 : 1.0;

      // 振幅缩放 — 略大振幅让心跳脉冲更明显，但整体保持温和 + 情绪事件动态加成
      const ampScale = (H * 0.42) * (0.75 + actNorm * 0.25);
      const dynamicAmpScale = ampScale * (1 + eventBoost * 0.12);

      // ═══ 采样 ECG 波形 ═══
      const samples = Math.max(150, Math.floor(W / 1.5));
      const points: { x: number; y: number; alpha: number }[] = [];

      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const xNorm = i / samples;

        // 时间映射 — 从右向左滚动
        const timeAtX = t - (1 - xNorm) * (W / scrollSpeed);

        // 心率变异（HRV）— 慢速噪声调制 beatDuration，相邻心跳间距 ±8% 抖动
        const beatIndex = Math.floor(timeAtX / beatDuration);
        // 规范化噪声索引到 [0,63]，兼容 reduceMotion 下 timeAtX 为负的情况
        const bi = ((beatIndex % 64) + 64) % 64;
        const hrvNoise = organicNoise(beatIndex * 0.7, t * 0.3, noiseSeed[bi]);
        const actualBeatDuration = beatDuration * (1 + hrvNoise * 0.08);

        // 心动周期相位 (0~1) — 使用 HRV 调制后的周期
        const phase = ((timeAtX / actualBeatDuration) % 1 + 1) % 1;

        // 波形微变 — 每个心跳形态略有不同（振幅 ±6%、宽度 ±4%），避免逐拍雷同
        const ampJitter = 1 + organicNoise(beatIndex * 1.3, t * 0.2, noiseSeed[(bi + 8) % 64]) * 0.06;
        const widthJitter = 1 + organicNoise(beatIndex * 0.9, t * 0.15, noiseSeed[(bi + 16) % 64]) * 0.04;
        const jitteredProfile: EcgProfile = {
          ...p,
          rAmp: p.rAmp * ampJitter,
          tAmp: p.tAmp * ampJitter,
          rWidth: p.rWidth * widthJitter,
        };

        // ECG 复合波值 — 传入扰动后的参数
        const ecgVal = ecgComplex(phase, jitteredProfile);

        // 基线肌电噪声 — 高频 0.008 + 慢速漂移 0.015，更贴近真实电极信号
        const fastNoise = (Math.sin(timeAtX * 31 + xNorm * 150) * 0.3 + Math.sin(timeAtX * 57) * 0.2) * 0.008;
        const slowDrift = organicNoise(xNorm * 3, t * 0.5, noiseSeed[32]) * 0.015;
        const totalNoise = fastNoise + slowDrift;

        // 边缘羽化
        const edgeFade = featherAlpha(xNorm);

        // 叠加呼吸基线漂移 — 双频叠加 + 心情状态调制
        const breathOffset = breathWave * breathScale * dynamicAmpScale * edgeFade;

        const y = cy - (ecgVal + totalNoise) * dynamicAmpScale * edgeFade + breathOffset;
        points.push({ x, y, alpha: edgeFade });
      }

      const [lr, lg, lb] = p.color;

      // ═══ 1. 淡网格背景 — 医用心电图纸效果 ═══
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.035)`;
      ctx.lineWidth = 0.5;
      const gridX = W / 24;
      const gridY = H / 6;
      for (let gx = 0; gx <= W; gx += gridX) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy <= H; gy += gridY) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // ═══ 2. 基线 — 带羽化的淡虚线 ═══
      const axisGrad = ctx.createLinearGradient(0, 0, W, 0);
      axisGrad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      axisGrad.addColorStop(0.06, `rgba(${lr}, ${lg}, ${lb}, 0.05)`);
      axisGrad.addColorStop(0.94, `rgba(${lr}, ${lg}, ${lb}, 0.05)`);
      axisGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      ctx.beginPath();
      ctx.strokeStyle = axisGrad;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 5]);
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // ═══ 3. ECG 波形 — 三层渲染（光晕 → 主线 → 亮芯） ═══
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 3a. 外层光晕
      ctx.lineWidth = 6;
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.07)`;
      ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, 0.3)`;
      ctx.shadowBlur = 12;
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

      // 3b. 主线 — 分段渲染以支持羽化 alpha
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const segAlpha = (p0.alpha + p1.alpha) / 2 * (0.6 + actNorm * 0.4);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha})`;
        ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha * 0.6})`;
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

      // 3c. 亮芯线 — 白色高光
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const segAlpha = (p0.alpha + p1.alpha) / 2 * (0.7 + actNorm * 0.3);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${segAlpha * 0.45})`;
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

      // ═══ 4. 当前位置扫描亮点（右侧） ═══
      const lastPoint = points[points.length - 1];
      if (lastPoint && lastPoint.alpha > 0.1) {
        const dotGrad = ctx.createRadialGradient(
          lastPoint.x, lastPoint.y, 0,
          lastPoint.x, lastPoint.y, 10,
        );
        dotGrad.addColorStop(0, `rgba(255, 255, 255, 0.9)`);
        dotGrad.addColorStop(0.3, `rgba(${lr}, ${lg}, ${lb}, 0.5)`);
        dotGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // 24fps 渲染 — 更从容的节奏
    let lastDraw = 0;
    const frameInterval = 1000 / 24;
    const loop = (now: number) => {
      if (now - lastDraw >= frameInterval) {
        lastDraw = now;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // 每 3 秒同步一次显示心情到 React state — 更慢的数字变化
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
