'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface GlassLightingState {
  x: number;
  y: number;
  intensity: number;
  fresnel: number;
  shiftX: number;
  shiftY: number;
}

export interface UseGlassLightingOptions {
  /** Whether to track global mouse movement. Default true. */
  trackMouse?: boolean;
  /** Whether to update lighting on scroll. Default true. */
  trackScroll?: boolean;
  /** Whether to update on device orientation (mobile). Default true. */
  trackOrientation?: boolean;
  /** Damping factor for smooth interpolation (0-1). Lower = smoother. Default 0.08. */
  damping?: number;
  /** Maximum refraction shift in pixels. Default 8. */
  maxShift?: number;
  /** Base fresnel value. Default 0.18. */
  baseFresnel?: number;
}

/**
 * Hook that drives dynamic Liquid Glass lighting.
 *
 * It listens to pointer movement, scroll velocity and device orientation,
 * then writes CSS custom properties to a container element so the browser
 * compositor can update gradients without React re-renders.
 *
 * CSS variables written:
 *   --glass-light-x
 *   --glass-light-y
 *   --glass-light-intensity
 *   --glass-fresnel
 *   --glass-refraction-shift-x
 *   --glass-refraction-shift-y
 */
type MouseMoveCallback = (e: MouseEvent) => void;

const mouseMoveSubscribers = new Set<MouseMoveCallback>();
let mouseMoveGlobalActive = false;

function globalMouseMoveHandler(e: MouseEvent): void {
  for (const cb of mouseMoveSubscribers) {
    cb(e);
  }
}

function subscribeMouseMove(cb: MouseMoveCallback): () => void {
  mouseMoveSubscribers.add(cb);
  if (!mouseMoveGlobalActive) {
    mouseMoveGlobalActive = true;
    window.addEventListener('mousemove', globalMouseMoveHandler, { passive: true });
  }
  return () => {
    mouseMoveSubscribers.delete(cb);
    if (mouseMoveGlobalActive && mouseMoveSubscribers.size === 0) {
      mouseMoveGlobalActive = false;
      window.removeEventListener('mousemove', globalMouseMoveHandler);
    }
  };
}

export function useGlassLighting<T extends HTMLElement = HTMLElement>(
  options: UseGlassLightingOptions = {},
) {
  const {
    trackMouse = true,
    trackScroll = true,
    trackOrientation = true,
    damping = 0.08,
    maxShift = 8,
    baseFresnel = 0.18,
  } = options;

  const ref = useRef<T>(null);
  const state = useRef<GlassLightingState>({
    x: 0.5,
    y: 0.3,
    intensity: 1,
    fresnel: baseFresnel,
    shiftX: 0,
    shiftY: 0,
  });
  const target = useRef<GlassLightingState>({ ...state.current });
  const raf = useRef<number | null>(null);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const scrollVelocity = useRef(0);
  const lastScroll = useRef(0);

  const writeCss = useCallback((el: T, s: GlassLightingState) => {
    const style = el.style;
    style.setProperty('--glass-light-x', s.x.toFixed(4));
    style.setProperty('--glass-light-y', s.y.toFixed(4));
    style.setProperty('--glass-light-intensity', s.intensity.toFixed(4));
    style.setProperty('--glass-fresnel', s.fresnel.toFixed(4));
    style.setProperty('--glass-refraction-shift-x', `${s.shiftX.toFixed(2)}px`);
    style.setProperty('--glass-refraction-shift-y', `${s.shiftY.toFixed(2)}px`);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Initialize with current CSS variable values or defaults.
    const computed = getComputedStyle(el);
    const parse = (name: string, fallback: number) => {
      const v = parseFloat(computed.getPropertyValue(name));
      return Number.isNaN(v) ? fallback : v;
    };
    state.current = {
      x: parse('--glass-light-x', 0.5),
      y: parse('--glass-light-y', 0.3),
      intensity: parse('--glass-light-intensity', 1),
      fresnel: parse('--glass-fresnel', baseFresnel),
      shiftX: parse('--glass-refraction-shift-x', 0),
      shiftY: parse('--glass-refraction-shift-y', 0),
    };
    target.current = { ...state.current };

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      writeCss(el, state.current);
      return;
    }

    const animate = () => {
      const s = state.current;
      const t = target.current;

      s.x += (t.x - s.x) * damping;
      s.y += (t.y - s.y) * damping;
      s.intensity += (t.intensity - s.intensity) * damping;
      s.fresnel += (t.fresnel - s.fresnel) * damping;
      s.shiftX += (t.shiftX - s.shiftX) * damping;
      s.shiftY += (t.shiftY - s.shiftY) * damping;

      writeCss(el, s);
      raf.current = requestAnimationFrame(animate);
    };

    raf.current = requestAnimationFrame(animate);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [damping, baseFresnel, writeCss]);

  useEffect(() => {
    if (!trackMouse) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      target.current.x = Math.max(0, Math.min(1, x));
      target.current.y = Math.max(0, Math.min(1, y));

      // Refraction shifts opposite to light direction, simulating thickness.
      target.current.shiftX = (0.5 - x) * maxShift;
      target.current.shiftY = (0.5 - y) * maxShift;

      // Slight intensity boost when cursor is close to center.
      const dist = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);
      target.current.intensity = 1 + (1 - Math.min(1, dist * 2)) * 0.18;

      lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    return subscribeMouseMove(handleMove);
  }, [trackMouse, maxShift]);

  useEffect(() => {
    if (!trackScroll) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      const now = window.scrollY;
      const delta = now - lastScroll.current;
      lastScroll.current = now;
      scrollVelocity.current = Math.min(Math.abs(delta) * 0.02, 1.2);

      // Scroll changes global light intensity and fresnel subtly.
      target.current.intensity = 1 + scrollVelocity.current * 0.12;
      target.current.fresnel = baseFresnel + scrollVelocity.current * 0.06;

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        scrollVelocity.current *= 0.9;
        target.current.intensity = 1 + scrollVelocity.current * 0.12;
        target.current.fresnel = baseFresnel + scrollVelocity.current * 0.06;
      }, 80);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, [trackScroll, baseFresnel]);

  useEffect(() => {
    if (!trackOrientation || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: -90..90 left/right tilt, beta: -180..180 front/back tilt
      const x = (e.gamma / 90 + 1) / 2;
      const y = (e.beta / 90 + 1) / 2;
      target.current.x = Math.max(0, Math.min(1, x));
      target.current.y = Math.max(0, Math.min(1, y));
      target.current.shiftX = (0.5 - x) * maxShift * 0.6;
      target.current.shiftY = (0.5 - y) * maxShift * 0.6;
    };

    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [trackOrientation, maxShift]);

  return ref;
}

/**
 * Utility hook for updating a single glass element from a parent pointer.
 * Useful when many glass surfaces live under a common container.
 */
export function useGlassLightingPointer<T extends HTMLElement = HTMLElement>(
  options: UseGlassLightingOptions = {},
) {
  const ref = useGlassLighting<T>(options);
  return { ref, state: null };
}
