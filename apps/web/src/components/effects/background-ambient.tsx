'use client';

/**
 * BackgroundAmbient —— 岁言温暖有机氛围背景
 *
 * 替代 SpheroAI 冷蓝波浪，使用生命绿、暖琥珀、柔和玫瑰的有机流动：
 * - 大面积柔和暖调渐变波纹流动
 * - 玻璃拟态底色
 * - 极轻噪点纹理
 * - 无粒子、无发光球
 *
 * 纯 CSS + Canvas 2D 实现，无外部依赖。
 */

import { useEffect, useRef, useState } from 'react';

interface WaveLayer {
  amplitude: number;
  wavelength: number;
  speed: number;
  yBase: number;
  color: string;
  opacity: number;
  phase: number;
}

export default function BackgroundAmbient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(
      typeof window !== 'undefined' &&
        (window.innerWidth < 768 ||
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
          )),
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ctx2 = ctx; // 锁定非 null 引用，供闭包使用

    let w = 0;
    let h = 0;
    let dpr = 1;
    let rafId = 0;
    let time = 0;
    let lastTime = 0;
    let lastDraw = 0;
    let isHidden = false;
    // 30fps 帧率节流，降低 GPU/CPU 负载
    const FRAME_INTERVAL = 1000 / 30;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx2.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const handleVisibility = () => {
      isHidden = document.hidden;
      if (!isHidden) {
        lastTime = 0;
        lastDraw = 0;
        rafId = requestAnimationFrame(animate);
      } else {
        cancelAnimationFrame(rafId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    /**
     * 绘制温暖有机流动波纹 —— 生命绿与暖琥珀交织
     * 精简为 2 层正弦波叠加，30fps 节流，降低渲染负载
     */
    function animate(now: number) {
      if (isHidden) return;
      // 帧率节流：跳过不足 30fps 间隔的帧
      if (now - lastDraw < FRAME_INTERVAL) {
        rafId = requestAnimationFrame(animate);
        return;
      }
      lastDraw = now;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
      lastTime = now;
      time += dt;

      ctx2.clearRect(0, 0, w, h);

      // === 波纹层 1：暖琥珀底部波 ===
      drawWave(ctx2, w, h, time, {
        amplitude: h * 0.08,
        wavelength: w * 0.8,
        speed: 0.15,
        yBase: h * 0.55,
        color: 'var(--color-warm)',
        opacity: 0.04,
        phase: 0,
      });

      // === 波纹层 2：生命绿中频波 ===
      drawWave(ctx2, w, h, time, {
        amplitude: h * 0.06,
        wavelength: w * 0.6,
        speed: 0.12,
        yBase: h * 0.65,
        color: 'var(--color-primary)',
        opacity: 0.035,
        phase: Math.PI * 0.5,
      });

      rafId = requestAnimationFrame(animate);
    }

    /**
     * 绘制单层正弦波填充
     */
    function drawWave(
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      time: number,
      opts: WaveLayer,
    ) {
      const { amplitude, wavelength, speed, yBase, color, opacity, phase } = opts;
      const freq = (Math.PI * 2) / wavelength;

      ctx.beginPath();
      ctx.moveTo(0, h);

      for (let x = 0; x <= w; x += 4) {
        const y =
          yBase +
          Math.sin(x * freq + time * speed * Math.PI * 2 + phase) * amplitude +
          Math.sin(x * freq * 2.3 + time * speed * 1.5) * amplitude * 0.3;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isMobile]);

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
      style={{
        // 基底深黑渐变 — 与首页统一
        background:
          'linear-gradient(180deg, var(--color-bg) 0%, var(--color-bg-elevated) 40%, var(--color-bg-elevated) 70%, var(--color-bg) 100%)',
      }}
    >
      {/* === 顶部柔和光晕（青绿色光源）=== */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 70%)',
        }}
      />

      {/* === 左上青色光斑 === */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 40% 40% at 15% 20%, color-mix(in srgb, var(--color-primary) 5%, transparent), transparent 60%)',
        }}
      />

      {/* === 右上暖琥珀光斑 === */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 35% 35% at 85% 15%, color-mix(in srgb, var(--color-warm) 4%, transparent), transparent 60%)',
        }}
      />

      {/* === 底部柔和玫瑰光斑 === */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 30% at 50% 90%, color-mix(in srgb, var(--color-rose) 3%, transparent), transparent 70%)',
        }}
      />

      {/* === 流动波纹 Canvas === */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* === 噪点纹理（极轻颗粒感）=== */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.015,
          mixBlendMode: 'screen',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'repeat',
          backgroundSize: '160px',
        }}
      />

      {/* === 暗角聚焦（极轻）=== */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 80% at 50% 40%, transparent 50%, color-mix(in srgb, var(--color-bg) 15%, transparent) 100%)',
        }}
      />

      {/* === Neural background mask definition (referenced by .root-neural-bg in globals.css)
       * Placed in the DOM so stroke/fill colors can reference CSS design tokens.
       */}
      <svg
        className="pointer-events-none fixed left-0 top-0 h-0 w-0"
        aria-hidden="true"
      >
        <defs>
          <mask
            id="neural-bg-mask"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="1200"
            height="400"
          >
            <rect width="1200" height="400" fill="var(--color-mask-transparent)" />
            <g
              fill="none"
              stroke="var(--color-neural-stroke)"
              strokeWidth="0.6"
              strokeLinecap="round"
            >
              <path d="M0,400 Q150,300 300,320 T600,280 T900,300 T1200,260" />
              <path
                d="M0,400 Q200,330 400,350 T800,310 T1200,330"
                stroke="var(--color-neural-stroke-soft)"
              />
              <path
                d="M0,400 Q120,360 260,370 Q420,380 560,350 Q720,320 880,340 Q1040,360 1200,340"
                stroke="var(--color-neural-stroke-faint)"
              />
            </g>
            <g fill="var(--color-neural-fill)">
              <circle cx="180" cy="330" r="1.6" />
              <circle cx="240" cy="300" r="1.2" />
              <circle cx="380" cy="340" r="1.6" />
              <circle cx="460" cy="300" r="1.2" />
              <circle cx="600" cy="350" r="1.6" />
              <circle cx="680" cy="320" r="1.2" />
              <circle cx="820" cy="345" r="1.6" />
              <circle cx="900" cy="310" r="1.2" />
              <circle cx="1040" cy="350" r="1.6" />
              <circle cx="1120" cy="320" r="1.2" />
            </g>
          </mask>
        </defs>
      </svg>
    </div>
  );
}
