'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LifeCoreState } from './life-core-canvas';
import { useEmotionStore } from '@/stores/emotion-store';

/**
 * Consciousness — 时墨 AI 意识状态
 * ─────────────────────────────────────────────────────────────
 * V2: 真实情感波动波形（Canvas 实时渲染）
 *
 * 用多频段叠加波形模拟真实情感波动：
 * - 陪伴中：平静 α 波 + 缓慢呼吸节律（温柔、安定）
 * - 学习中：活跃 β 波 + 快速起伏（好奇、兴奋）
 * - 整理记忆：θ 波 + 潮汐式涨落（回忆、沉浸）
 * - 理解家庭：γ 波 + 丰富谐波（领悟、连接）
 *
 * 每条波形都是多个正弦波 + 噪声叠加，形成有机的情感起伏
 */

export const CONSCIOUSNESS_LABEL: Record<LifeCoreState, string> = {
  companion: '陪伴中',
  learning: '学习中',
  recalling: '整理记忆',
  growing: '理解家庭',
};

/** 每种状态的情感波形参数 */
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
  /** 情感波动周期（秒）— 控制宏观涨落 */
  emotionCycle: number;
}> = {
  companion: {
    baseFreq: 0.8, harmFreq: 2.1, amplitude: 12, noise: 0.15, layers: 3,
    color: [0, 210, 106], emotionCycle: 7,
  },
  learning: {
    baseFreq: 2.2, harmFreq: 4.5, amplitude: 20, noise: 0.3, layers: 4,
    color: [120, 255, 180], emotionCycle: 3.5,
  },
  recalling: {
    baseFreq: 0.5, harmFreq: 1.3, amplitude: 16, noise: 0.1, layers: 3,
    color: [100, 220, 150], emotionCycle: 10,
  },
  growing: {
    baseFreq: 1.5, harmFreq: 3.8, amplitude: 22, noise: 0.25, layers: 5,
    color: [0, 255, 140], emotionCycle: 5,
  },
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
  const profile = EMOTION_PROFILE[state] ?? EMOTION_PROFILE.companion;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef({ state, activity, profile });
  stateRef.current = { state, activity, profile };

  // 同步到全局 emotion store — 让 EmotionWaveBar 实时联动
  const setEmotionState = useEmotionStore((s) => s.setState);
  const setActivityLevel = useEmotionStore((s) => s.setActivity);
  useEffect(() => { setEmotionState(state); }, [state, setEmotionState]);
  useEffect(() => { setActivityLevel(activity); }, [activity, setActivityLevel]);

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

    // 种子化噪声 — 确定性但有机
    const noiseSeed = Array.from({ length: 64 }, () => Math.random() * 1000);

    const startTime = performance.now() / 1000;

    const draw = () => {
      const now = performance.now() / 1000;
      const t = now - startTime;
      const { profile: p, activity: act } = stateRef.current;

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;
      const actNorm = act / 100; // 0~1

      // 情感宏观波动 — 缓慢的涨落控制整体振幅
      const emotionWave = 0.6 + 0.4 * Math.sin(t * (Math.PI * 2 / p.emotionCycle));
      const dynamicAmp = p.amplitude * (0.5 + actNorm * 0.5) * emotionWave;

      // 多层波形渲染 — Catmull-Rom 样条平滑曲线
      for (let layer = 0; layer < p.layers; layer++) {
        const layerPhase = layer * 0.7;
        const layerAmp = dynamicAmp * (1 - layer * 0.18);
        const layerFreq = p.baseFreq * (1 + layer * 0.15);
        const layerAlpha = (0.7 - layer * 0.12) * (0.5 + actNorm * 0.5);

        const [r, g, b] = p.color;

        // 采样点
        const samples = Math.max(40, Math.floor(W / 3));
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= samples; i++) {
          const x = (i / samples) * W;
          const xNorm = i / samples;

          const mainWave = Math.sin(xNorm * Math.PI * 2 * layerFreq + t * 1.5 + layerPhase);
          const harmWave = Math.sin(xNorm * Math.PI * 2 * p.harmFreq + t * 0.8 + layerPhase * 1.3) * 0.3;
          const subWave = Math.sin(xNorm * Math.PI * 2 * (layerFreq * 0.5) + t * 0.4) * 0.2;

          const noiseIdx = Math.floor(xNorm * 16) % noiseSeed.length;
          const noiseVal = Math.sin(t * 2 + noiseSeed[noiseIdx]) * p.noise;

          const spike = Math.sin(t * 0.7 + xNorm * 8 + layerPhase) > 0.85
            ? Math.sin(t * 5 + xNorm * 20) * 0.15
            : 0;

          const y = cy + (mainWave + harmWave + subWave + noiseVal + spike) * layerAmp;
          points.push({ x, y });
        }

        // Catmull-Rom 样条 → 贝塞尔曲线平滑渲染
        ctx.beginPath();
        ctx.lineWidth = layer === 0 ? 2.5 : 1.5;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${layerAlpha})`;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 用 quadraticCurveTo 中点法平滑连接所有采样点
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        // 最后一段
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);

        // 先画一层模糊辉光（模拟抗锯齿+发光）
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
        ctx.shadowBlur = layer === 0 ? 6 : 3;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // 波形下方填充 — 轻微辉光
        if (layer === 0) {
          ctx.lineTo(W, H);
          ctx.lineTo(0, H);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, cy - dynamicAmp, 0, H);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      // 中心轴线 — 淡淡的基线
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, 0.08)`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // 更新动态参数（用于下次帧的动画连续性）
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
