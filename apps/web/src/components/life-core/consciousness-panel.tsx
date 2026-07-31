'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';

/**
 * Mood Panel — 时墨心情波形
 * ─────────────────────────────────────────────────────────────
 * V4: 真实情感波动 + 两边羽化淡出
 *
 * 波形图整体代表时墨当前的心情波动：
 * - 温柔陪伴：平静 α 波 + 缓慢呼吸节律（温柔、安定）💚
 * - 好奇探索：活跃 β 波 + 快速起伏（好奇、兴奋）💙
 * - 怀旧回忆：θ 波 + 潮汐式涨落（怀念、沉浸）🧡
 * - 欣喜成长：γ 波 + 丰富谐波（欣喜、连接）💗
 *
 * V4 改进：
 * - 用多频段噪声(模拟Perlin)替代纯正弦波，有机感更强
 * - 情绪事件系统：偶发的情感涟漪（突如其来的愉悦、沉思）
 * - 基线漂移：心情不会完美居中，更真实
 * - 两边羽化：振幅和透明度在左右边缘平滑淡出
 * - 分段渲染：每段使用独立 alpha，实现精确的羽化控制
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

/** 每种心情的波形参数 */
const EMOTION_PROFILE: Record<LifeCoreState, {
  /** 基础频率（Hz 概念，实际是角速度倍率） */
  baseFreq: number;
  /** 次谐波频率 */
  harmFreq: number;
  /** 基础振幅（px） */
  amplitude: number;
  /** 噪声强度 */
  noise: number;
  /** 波形层数 */
  layers: number;
  /** 波形颜色（RGB） */
  color: [number, number, number];
  /** 心情波动周期（秒）— 控制宏观涨落 */
  emotionCycle: number;
}> = {
  companion: {
    baseFreq: 0.8, harmFreq: 2.1, amplitude: 12, noise: 0.15, layers: 3,
    color: [82, 196, 128], emotionCycle: 7,
  },
  learning: {
    baseFreq: 2.2, harmFreq: 4.5, amplitude: 20, noise: 0.3, layers: 4,
    color: [86, 180, 233], emotionCycle: 3.5,
  },
  recalling: {
    baseFreq: 0.5, harmFreq: 1.3, amplitude: 16, noise: 0.1, layers: 3,
    color: [230, 162, 90], emotionCycle: 10,
  },
  growing: {
    baseFreq: 1.5, harmFreq: 3.8, amplitude: 22, noise: 0.25, layers: 5,
    color: [232, 134, 174], emotionCycle: 5,
  },
};

interface ConsciousnessPanelProps {
  state: LifeCoreState;
  /** 心情指数百分比 0-100 */
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
  const profile = EMOTION_PROFILE[state] ?? EMOTION_PROFILE.companion;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef({ state, activity, profile });
  stateRef.current = { state, activity, profile };

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
    const noiseSeed = Array.from({ length: 128 }, () => Math.random() * 1000);
    // 情绪事件种子 — 随机的情感波动事件（突如其来的愉悦、沉思等）
    const eventSeed = Array.from({ length: 12 }, () => ({
      time: Math.random() * 20,
      intensity: 0.3 + Math.random() * 0.7,
      duration: 2 + Math.random() * 4,
      freq: 0.5 + Math.random() * 2,
    }));

    const startTime = performance.now() / 1000;

    /** 多频段噪声 — 模拟 Perlin 噪声的有机起伏 */
    const organicNoise = (x: number, t: number, seed: number): number => {
      const n1 = Math.sin(x * 1.3 + t * 0.7 + seed) * 0.5;
      const n2 = Math.sin(x * 2.7 + t * 1.1 + seed * 1.7) * 0.3;
      const n3 = Math.sin(x * 5.1 + t * 1.9 + seed * 2.3) * 0.15;
      const n4 = Math.sin(x * 9.3 + t * 2.3 + seed * 3.1) * 0.08;
      return n1 + n2 + n3 + n4;
    };

    /** 边缘羽化函数 — 两边平滑淡出 */
    const featherAlpha = (xNorm: number): number => {
      // 左边羽化区间 0~0.12, 右边羽化区间 0.88~1.0
      const leftEdge = 0.12;
      const rightEdge = 0.88;
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
        const cycle = 15 + evt.duration * 3;
        const phase = (t % cycle) - evt.time;
        if (phase > 0 && phase < evt.duration) {
          // 钟形包络 — 自然涌起又消退
          const env = Math.sin((phase / evt.duration) * Math.PI);
          sum += env * evt.intensity * Math.sin(t * evt.freq * Math.PI * 2);
        }
      }
      return sum;
    };

    const draw = () => {
      const now = performance.now() / 1000;
      const t = now - startTime;
      const { profile: p, activity: act } = stateRef.current;

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;
      const actNorm = act / 100; // 0~1

      // 真实心情宏观波动 — 多频段叠加 + 情绪事件
      const slowMood = organicNoise(t * 0.15, t * 0.1, noiseSeed[0]);
      const emotionWave = 0.55 + 0.3 * slowMood + 0.15 * Math.sin(t * (Math.PI * 2 / p.emotionCycle));
      const eventBoost = moodEvent(t);
      const dynamicAmp = p.amplitude * (0.4 + actNorm * 0.6) * Math.max(0.2, emotionWave + eventBoost * 0.3);

      // 基线漂移 — 心情不会完美居中
      const baselineDrift = organicNoise(t * 0.08, t * 0.05, noiseSeed[1]) * 3;

      // 多层波形渲染
      for (let layer = 0; layer < p.layers; layer++) {
        const layerPhase = layer * 0.7 + noiseSeed[layer * 3] * 0.01;
        const layerAmp = dynamicAmp * (1 - layer * 0.18);
        const layerFreq = p.baseFreq * (1 + layer * 0.15);

        const [r, g, b] = p.color;

        // 采样点
        const samples = Math.max(60, Math.floor(W / 2));
        const points: { x: number; y: number; alpha: number }[] = [];
        for (let i = 0; i <= samples; i++) {
          const x = (i / samples) * W;
          const xNorm = i / samples;

          // 有机主波 — 多频段噪声替代纯正弦
          const mainWave = organicNoise(xNorm * layerFreq * Math.PI, t * 1.2, layerPhase);
          const harmWave = organicNoise(xNorm * p.harmFreq * Math.PI, t * 0.8, layerPhase * 1.3 + 10) * 0.35;
          const subWave = Math.sin(xNorm * Math.PI * 2 * (layerFreq * 0.5) + t * 0.4) * 0.15;

          // 高频细节噪声 — 增加真实感
          const noiseIdx = Math.floor(xNorm * 32) % noiseSeed.length;
          const noiseVal = organicNoise(t * 1.5 + noiseSeed[noiseIdx], t * 2, noiseSeed[noiseIdx + 1]) * p.noise;

          // 情绪事件影响 — 偶发的涟漪
          const eventRipple = eventBoost * Math.sin(xNorm * Math.PI * 3 + t * 2) * 0.2;

          // 边缘羽化 — 振幅在两边衰减
          const edgeFade = featherAlpha(xNorm);
          const ampFade = 0.3 + 0.7 * edgeFade;

          const y = cy + baselineDrift + (mainWave + harmWave + subWave + noiseVal + eventRipple) * layerAmp * ampFade;
          points.push({ x, y, alpha: edgeFade });
        }

        // 用 quadraticCurveTo 中点法平滑连接 — 分段渲染以支持羽化 alpha
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = layer === 0 ? 2.5 : 1.5;

        const [lr, lg, lb] = p.color;
        const baseAlpha = (0.7 - layer * 0.12) * (0.5 + actNorm * 0.5);

        // 分段绘制 — 每段使用羽化后的 alpha
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          const segAlpha = (p0.alpha + p1.alpha) / 2 * baseAlpha;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha})`;
          ctx.shadowColor = `rgba(${lr}, ${lg}, ${lb}, ${segAlpha * 0.5})`;
          ctx.shadowBlur = layer === 0 ? 6 : 3;

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
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // 波形下方填充 — 带羽化的渐变
        if (layer === 0) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }
          const lastP = points[points.length - 1];
          ctx.lineTo(lastP.x, lastP.y);
          ctx.lineTo(W, H);
          ctx.lineTo(0, H);
          ctx.closePath();

          // 水平羽化渐变 — 两边淡出
          const grad = ctx.createLinearGradient(0, 0, W, 0);
          grad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0)`);
          grad.addColorStop(0.12, `rgba(${lr}, ${lg}, ${lb}, 0.06)`);
          grad.addColorStop(0.5, `rgba(${lr}, ${lg}, ${lb}, 0.08)`);
          grad.addColorStop(0.88, `rgba(${lr}, ${lg}, ${lb}, 0.06)`);
          grad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      // 中心轴线 — 带羽化的淡基线
      const axisGrad = ctx.createLinearGradient(0, 0, W, 0);
      const [ar, ag, ab] = p.color;
      axisGrad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
      axisGrad.addColorStop(0.5, `rgba(${ar}, ${ag}, ${ab}, 0.08)`);
      axisGrad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
      ctx.beginPath();
      ctx.strokeStyle = axisGrad;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(0, cy + baselineDrift);
      ctx.lineTo(W, cy + baselineDrift);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // 30fps 渲染
    let lastDraw = 0;
    const frameInterval = 1000 / 30;
    const loop = (now: number) => {
      if (now - lastDraw >= frameInterval) {
        lastDraw = now;
        if (!reduceMotion) draw();
        else draw(); // 静态模式也渲染一帧
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
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
        <strong>{Math.round(activity)}</strong>
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
