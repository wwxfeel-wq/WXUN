'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useEmotionStore } from '@/stores/emotion-store';

/**
 * EmotionWaveBar — 全局常驻情感波形条
 * ─────────────────────────────────────────────────────────────
 * 在整个项目顶部显示一条极细的情感波形条
 * - 实时渲染时墨的情感波动状态
 * - 翡翠绿配色，与项目设计系统一致
 * - 极低高度，不干扰内容
 * - 玻璃质感背景，融入液态玻璃设计语言
 * - 滚动时智能隐藏标签，仅保留波形
 * - Catmull-Rom 样条 + 双通道渲染，彻底消除锯齿
 */

type WaveState = 'companion' | 'learning' | 'recalling' | 'growing';

const STATE_LABELS: Record<WaveState, string> = {
  companion: '陪伴中',
  learning: '学习中',
  recalling: '整理记忆',
  growing: '理解家庭',
};

const STATE_PROFILES: Record<WaveState, {
  baseFreq: number;
  harmFreq: number;
  amplitude: number;
  noise: number;
  emotionCycle: number;
}> = {
  companion: { baseFreq: 0.8, harmFreq: 2.1, amplitude: 0.6, noise: 0.15, emotionCycle: 7 },
  learning: { baseFreq: 2.2, harmFreq: 4.5, amplitude: 0.8, noise: 0.3, emotionCycle: 3.5 },
  recalling: { baseFreq: 0.5, harmFreq: 1.3, amplitude: 0.5, noise: 0.1, emotionCycle: 10 },
  growing: { baseFreq: 1.5, harmFreq: 3.8, amplitude: 0.9, noise: 0.25, emotionCycle: 5 },
};

/**
 * Catmull-Rom 样条 → 三次贝塞尔曲线
 * 产生 C1 连续的超平滑曲线，彻底消除锯齿。
 *
 * 对每段 P[i]→P[i+1]，使用 P[i-1] 和 P[i+2] 作为控制参考，
 * 转换为 cubic-bezier 的两个控制点。
 */
function drawCatmullRom(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    // Catmull-Rom → Bézier 控制点
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

export default function EmotionWaveBar() {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // 从全局 store 订阅实时情感数据
  const emotionState = useEmotionStore((s) => s.state);
  const activity = useEmotionStore((s) => s.activity);

  const stateRef = useRef({ activity, currentState: emotionState });
  stateRef.current = { activity, currentState: emotionState };

  // 滚动检测 — 滚动时隐藏标签，仅保留波形
  useEffect(() => {
    const handleScroll = () => {
      document.body.classList.toggle('emotion-bar-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, DPR = 1;
    const resize = () => {
      // DPR 上限 2，避免 3x 屏幕过度消耗内存
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

    const noiseSeed = Array.from({ length: 64 }, () => Math.random() * 1000);
    const startTime = performance.now() / 1000;

    const draw = () => {
      const now = performance.now() / 1000;
      const t = now - startTime;
      const { activity: act, currentState: cs } = stateRef.current;
      const p = STATE_PROFILES[cs];

      ctx.clearRect(0, 0, W, H);

      const cy = H / 2;
      const actNorm = act / 100;
      const maxAmp = H * 0.38;

      // 情感宏观波动 — 缓慢涨落控制整体振幅
      const emotionWave = 0.6 + 0.4 * Math.sin(t * (Math.PI * 2 / p.emotionCycle));
      const dynamicAmp = maxAmp * p.amplitude * (0.5 + actNorm * 0.5) * emotionWave;

      for (let layer = 0; layer < 3; layer++) {
        const layerPhase = layer * 0.7;
        const layerAmp = dynamicAmp * (1 - layer * 0.2);
        const layerFreq = p.baseFreq * (1 + layer * 0.15);
        const layerAlpha = (0.85 - layer * 0.22) * (0.4 + actNorm * 0.4);

        // 高密度采样 — 每 2px 一个点，确保曲线极致平滑
        const samples = Math.max(80, Math.floor(W / 2));
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= samples; i++) {
          const x = (i / samples) * W;
          const xNorm = i / samples;

          const mainWave = Math.sin(xNorm * Math.PI * 2 * layerFreq + t * 1.5 + layerPhase);
          const harmWave = Math.sin(xNorm * Math.PI * 2 * p.harmFreq + t * 0.8 + layerPhase * 1.3) * 0.3;
          const subWave = Math.sin(xNorm * Math.PI * 2 * (layerFreq * 0.5) + t * 0.4) * 0.2;

          const noiseIdx = Math.floor(xNorm * 16) % noiseSeed.length;
          const noiseVal = Math.sin(t * 2 + noiseSeed[noiseIdx]) * p.noise;

          const y = cy + (mainWave + harmWave + subWave + noiseVal) * layerAmp;
          points.push({ x, y });
        }

        // ── Pass 1: 宽笔辉光（模拟抗锯齿 + 发光底色）──
        drawCatmullRom(ctx, points);
        ctx.lineWidth = layer === 0 ? 4 : 2.5;
        ctx.strokeStyle = `rgba(0, 210, 106, ${layerAlpha * 0.12})`;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // ── Pass 2: 细笔实线（清晰主体）──
        drawCatmullRom(ctx, points);
        ctx.lineWidth = layer === 0 ? 1.5 : 1;
        ctx.strokeStyle = `rgba(0, 210, 106, ${layerAlpha})`;
        ctx.stroke();

        // ── 底部渐变填充（仅第一层）──
        if (layer === 0) {
          ctx.lineTo(W, H);
          ctx.lineTo(0, H);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, cy - dynamicAmp, 0, H);
          grad.addColorStop(0, 'rgba(0, 210, 106, 0.06)');
          grad.addColorStop(1, 'rgba(0, 210, 106, 0)');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }
    };

    // 30fps 渲染
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

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [reduceMotion]);

  return (
    <div
      className="emotion-wave-bar"
      role="status"
      aria-label={`时墨情感状态：${STATE_LABELS[emotionState]}，活跃度 ${Math.round(activity)}%`}
    >
      <div className="emotion-wave-bar__bg" />
      <canvas
        ref={canvasRef}
        className="emotion-wave-bar__canvas"
        aria-hidden="true"
      />
      <div className="emotion-wave-bar__label">
        <span className="emotion-wave-bar__dot" />
        <span className="emotion-wave-bar__text">{STATE_LABELS[emotionState]}</span>
        <span className="emotion-wave-bar__activity">{Math.round(activity)}%</span>
      </div>
    </div>
  );
}
