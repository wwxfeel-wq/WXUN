'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

/**
 * Auth layout - Immersive full-screen Liquid Glass environment.
 * No traditional forms. A living, breathing entry point.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* Deep ambient orbs */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 rounded-full bg-accent/10 blur-orb-2xl"
        style={{ width: 'var(--orb-size-lg)', height: 'var(--orb-size-lg)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 rounded-full bg-primary/8 blur-orb-2xl"
        style={{ width: 'var(--orb-size-lg)', height: 'var(--orb-size-lg)' }}
      />
      <div className="pointer-events-none absolute left-1/3 top-1/3 h-80 w-80 rounded-full bg-[var(--color-purple)]/8 blur-orb-xl" />

      {/* Floating particles canvas */}
      <AuthAmbient />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Subtle floating particle canvas for auth pages. */
function AuthAmbient() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: Array<{
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      opacity: number;
      color: string;
    }> = [];

    const tokenColors: string[] = [
      'var(--color-secondary)',
      'var(--color-success)',
      'var(--color-purple)',
    ];

    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * (canvas?.width ?? 800),
        y: Math.random() * (canvas?.height ?? 600),
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.3 + 0.1,
        color: tokenColors[Math.floor(Math.random() * tokenColors.length)],
      });
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `color-mix(in srgb, ${p.color} ${Math.round(p.opacity * 100)}%, transparent)`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}
