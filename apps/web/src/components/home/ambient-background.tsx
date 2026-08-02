'use client';

import { useReducedMotion } from 'framer-motion';

/**
 * AmbientBackground — 极简柔光环境背景
 * ─────────────────────────────────────────────────────────────
 * 纯 CSS 实现，零 canvas / 零 RAF。
 * 深色空间 + 柔和翡翠绿辉光 + 少量缓慢漂浮的光点。
 * 替代复杂的粒子神经元树，视觉极简、性能最优。
 */

interface AmbientBackgroundProps {
  className?: string;
}

// 预定义 12 个光点位置 — 手动分布比随机更均匀
const DOTS = [
  { top: '12%', left: '18%', size: 3, delay: '0s', duration: '12s' },
  { top: '25%', left: '72%', size: 2, delay: '2s', duration: '14s' },
  { top: '38%', left: '45%', size: 4, delay: '4s', duration: '16s' },
  { top: '55%', left: '15%', size: 2, delay: '1s', duration: '13s' },
  { top: '68%', left: '80%', size: 3, delay: '3s', duration: '15s' },
  { top: '78%', left: '35%', size: 2, delay: '5s', duration: '11s' },
  { top: '15%', left: '55%', size: 2, delay: '6s', duration: '17s' },
  { top: '45%', left: '88%', size: 3, delay: '2.5s', duration: '14s' },
  { top: '62%', left: '52%', size: 2, delay: '4.5s', duration: '16s' },
  { top: '82%', left: '68%', size: 2, delay: '1.5s', duration: '13s' },
  { top: '32%', left: '28%', size: 3, delay: '3.5s', duration: '15s' },
  { top: '50%', left: '62%', size: 2, delay: '5.5s', duration: '12s' },
];

export function AmbientBackground({ className }: AmbientBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={className} aria-hidden="true">
      {/* 柔和翡翠绿辉光层 */}
      <div className="ambient-bg__glow" />

      {/* 缓慢漂浮的光点 — reduceMotion 时静止 */}
      {!reduceMotion && (
        <div className="ambient-bg__dots">
          {DOTS.map((dot, i) => (
            <span
              key={i}
              className="ambient-bg__dot"
              style={{
                top: dot.top,
                left: dot.left,
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                animationDelay: dot.delay,
                animationDuration: dot.duration,
              }}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        :global(.ambient-bg) {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .ambient-bg__glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 50% 35%, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 70%),
            radial-gradient(ellipse 40% 35% at 20% 70%, color-mix(in srgb, var(--color-primary) 4%, transparent), transparent 65%),
            radial-gradient(ellipse 45% 40% at 80% 60%, color-mix(in srgb, var(--color-highlight) 3%, transparent), transparent 65%);
        }

        .ambient-bg__dots {
          position: absolute;
          inset: 0;
        }

        .ambient-bg__dot {
          position: absolute;
          border-radius: 50%;
          background: color-mix(in srgb, var(--color-primary) 60%, transparent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--color-primary) 40%, transparent);
          opacity: 0;
          animation: ambientFloat var(--dur, 14s) ease-in-out infinite;
          animation-delay: var(--delay, 0s);
        }

        @keyframes ambientFloat {
          0%, 100% {
            opacity: 0;
            transform: translate(0, 0) scale(0.8);
          }
          20% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.7;
            transform: translate(8px, -12px) scale(1);
          }
          80% {
            opacity: 0.4;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ambient-bg__dot {
            animation: none;
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}

export default AmbientBackground;
