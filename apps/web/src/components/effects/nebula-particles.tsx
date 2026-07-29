'use client';

/**
 * NebulaParticles —— 星云粒子神经元
 *
 * 宇宙星云风格的粒子系统，营造浩瀚神经网络的视觉效果：
 * - 多层粒子云（微小恒星 + 中型星云团块 + 大型氛围云）
 * - 柔和的缓速漂浮，自然的深度视差
 * - 临近粒子间的神经突触连接（细线 + 信号脉冲）
 * - 全部颜色引用设计令牌（紫/蓝/粉/青）
 * - 响应 prefers-reduced-motion：静态渲染
 * - visibilitychange 节流：离开标签页自动暂停
 */

import { useEffect, useRef } from 'react';

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Particle {
  x: number;
  y: number;
  z: number; // depth 0..1 (越小越远)
  r: number;
  vx: number;
  vy: number;
  baseOpacity: number;
  color: RGBA;
  phase: number;
  pulseSpeed: number;
}

interface NebulaParticlesProps {
  className?: string;
  /** 粒子密度系数；默认按容器面积自适应 */
  density?: number;
  /** 是否绘制神经连线 */
  connections?: boolean;
}

const NEBULA_COLORS = [
  'var(--color-purple)',
  'var(--color-secondary)',
  'var(--color-primary)',
  'var(--color-rose)',
  'var(--color-highlight)',
  'var(--color-info)',
];

const CONNECTION_DISTANCE = 220;
const MAX_CONNECTIONS = 3;

function resolveCssColor(value: string): RGBA {
  if (typeof window === 'undefined') {
    return { r: 150, g: 180, b: 255, a: 1 };
  }

  let raw = value.trim();
  const varMatch = raw.match(/^var\((--[^)]+)\)$/);
  if (varMatch) {
    raw = getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim() || raw;
  }

  const rgbaMatch = raw.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*(?:\.\d+)?)\s*)?\)/,
  );
  if (rgbaMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(rgbaMatch[1]))),
      g: Math.min(255, Math.max(0, Number(rgbaMatch[2]))),
      b: Math.min(255, Math.max(0, Number(rgbaMatch[3]))),
      a: rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, Number(rgbaMatch[4]))) : 1,
    };
  }

  const hexMatch = raw.match(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const step = hex.length <= 4 ? 1 : 2;
    const parse = (i: number) => {
      const v = parseInt(hex.slice(i * step, i * step + step), 16);
      return step === 1 ? v * 17 : v;
    };
    return {
      r: parse(0),
      g: parse(1),
      b: parse(2),
      a: hex.length >= step * 4 ? parse(3) / 255 : 1,
    };
  }

  return { r: 150, g: 180, b: 255, a: 1 };
}

export default function NebulaParticles({
  className,
  density,
  connections = true,
}: NebulaParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cvs = canvas;
    const c = ctx;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resolvedColors = NEBULA_COLORS.map(resolveCssColor);

    let rafId = 0;
    let isHidden = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const particles: Particle[] = [];

    function resize() {
      const parent = cvs.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      cvs.width = width * dpr;
      cvs.height = height * dpr;
      cvs.style.width = `${width}px`;
      cvs.style.height = `${height}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticles() {
      particles.length = 0;
      const area = width * height;
      const particleCount = density ?? Math.max(40, Math.min(120, Math.floor(area / 8000)));
      const colors = resolvedColors.length ? resolvedColors : NEBULA_COLORS.map(resolveCssColor);

      for (let i = 0; i < particleCount; i++) {
        const baseColor = colors[Math.floor(Math.random() * colors.length)];
        const z = Math.random(); // depth 0=far, 1=near
        const layerOpacity = 0.35 + z * 0.55;
        const layerRadius = z * 3.2 + 1.2;
        const layerSpeed = (1 - z * 0.7) * 0.4;

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          r: layerRadius,
          vx: (Math.random() - 0.5) * layerSpeed,
          vy: (Math.random() - 0.5) * layerSpeed,
          baseOpacity: layerOpacity,
          color: baseColor,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.4 + Math.random() * 0.8,
        });
      }

      // 按深度排序：远的先绘制
      particles.sort((a, b) => a.z - b.z);
    }

    function rgbaString(color: RGBA, alpha: number) {
      return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * color.a})`;
    }

    function drawParticle(p: Particle, time: number) {
      const pulse = 0.6 + 0.4 * Math.sin(time * p.pulseSpeed + p.phase);
      const radius = p.r * pulse;
      const alpha = p.baseOpacity * pulse;

      // 星云光晕
      const glowRadius = radius * (14 + p.z * 6);
      const glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
      glow.addColorStop(0, rgbaString(p.color, alpha * 1.0));
      glow.addColorStop(0.3, rgbaString(p.color, alpha * 0.7));
      glow.addColorStop(0.6, rgbaString(p.color, alpha * 0.3));
      glow.addColorStop(1, 'rgba(0,0,0,0)');

      c.beginPath();
      c.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
      c.fillStyle = glow;
      c.fill();

      // 核心亮点
      c.beginPath();
      c.arc(p.x, p.y, radius, 0, Math.PI * 2);
      c.fillStyle = rgbaString(p.color, Math.min(1, alpha + 0.5));
      c.shadowBlur = radius * (12 + p.z * 8);
      c.shadowColor = rgbaString(p.color, alpha * 0.9);
      c.fill();
      c.shadowBlur = 0;

      // 额外白核高光
      if (p.z > 0.5) {
        c.beginPath();
        c.arc(p.x, p.y, radius * 0.4, 0, Math.PI * 2);
        c.fillStyle = rgbaString({ r: 255, g: 255, b: 255, a: 1 }, alpha * 0.8);
        c.fill();
      }
    }

    function drawConnections(time: number) {
      if (!connections || particles.length < 2) return;

      for (let i = 0; i < particles.length; i++) {
        let connected = 0;
        for (let j = i + 1; j < particles.length && connected < MAX_CONNECTIONS; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > CONNECTION_DISTANCE) continue;

          // 只连接深度相近的粒子
          if (Math.abs(a.z - b.z) > 0.3) continue;

          const strength = 1 - dist / CONNECTION_DISTANCE;
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.6 + a.phase + b.phase);
          const alpha = strength * 0.5 * pulse * Math.min(a.baseOpacity, b.baseOpacity);

          // 神经突触连线
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.strokeStyle = rgbaString(a.color, alpha);
          c.lineWidth = strength * 1.8;
          c.shadowBlur = strength * 10;
          c.shadowColor = rgbaString(a.color, alpha * 0.8);
          c.stroke();
          c.shadowBlur = 0;

          // 流动的信号光点
          const signalT = (time * 0.3 + (a.phase + b.phase) * 0.5) % 1;
          const sx = a.x + (b.x - a.x) * signalT;
          const sy = a.y + (b.y - a.y) * signalT;
          const signalR = (a.r * (1 - signalT) + b.r * signalT) * 1.8;

          c.beginPath();
          c.arc(sx, sy, signalR, 0, Math.PI * 2);
          c.fillStyle = rgbaString(a.color, Math.min(1, alpha * 3.0 + 0.6));
          c.shadowBlur = signalR * 10;
          c.shadowColor = rgbaString(a.color, 0.95);
          c.fill();
          c.shadowBlur = 0;

          connected++;
        }
      }
    }

    function update() {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;
        if (p.y < -30) p.y = height + 30;
        if (p.y > height + 30) p.y = -30;
      }
    }

    function draw(time: number) {
      c.clearRect(0, 0, width, height);
      c.globalCompositeOperation = 'lighter';
      drawConnections(time * 0.001);
      for (const p of particles) {
        drawParticle(p, time * 0.001);
      }
      c.globalCompositeOperation = 'source-over';
    }

    function frame(time: number) {
      if (isHidden) return;
      if (!reducedMotion) {
        update();
      }
      draw(reducedMotion ? 0 : time);
      if (!reducedMotion) {
        rafId = requestAnimationFrame(frame);
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        isHidden = true;
        cancelAnimationFrame(rafId);
      } else {
        isHidden = false;
        if (!reducedMotion) {
          rafId = requestAnimationFrame(frame);
        }
      }
    }

    resize();
    createParticles();

    const ro = new ResizeObserver(() => {
      resize();
      createParticles();
      if (reducedMotion) draw(0);
    });
    if (cvs.parentElement) ro.observe(cvs.parentElement);

    document.addEventListener('visibilitychange', handleVisibility);
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [density, connections]);

  return (
    <canvas
      ref={canvasRef}
      className={`${className} w-full h-full block`}
      aria-hidden="true"
    />
  );
}
