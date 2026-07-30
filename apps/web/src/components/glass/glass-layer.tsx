'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { useGlassLighting, type UseGlassLightingOptions } from './use-glass-lighting';

export const glassLayerVariants = cva(
  [
    'glass-layer relative isolate overflow-hidden',
    'transition-[transform,box-shadow,border-color,background-color] duration-300 ease-liquid',
    'will-change-transform',
  ],
  {
    variants: {
      intensity: {
        subtle:
          'rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] backdrop-blur-subtle',
        default:
          'rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] backdrop-blur-glass',
        strong:
          'rounded-2xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-strong)] backdrop-blur-heavy',
        modal:
          'rounded-3xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-strong)] backdrop-blur-heavy',
      },
      interactive: {
        true: 'cursor-pointer hover:bg-[var(--color-glass-hover)] hover:border-[var(--color-glass-border-hover)] hover:shadow-glass active:scale-[var(--state-active-scale)]',
        false: '',
      },
    },
    defaultVariants: {
      intensity: 'default',
      interactive: false,
    },
  },
);

export type GlassLayerIntensity = VariantProps<typeof glassLayerVariants>['intensity'];

export interface GlassLayerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassLayerVariants>,
    UseGlassLightingOptions {
  /** Render smoky horizontal light streaks (frosted-glass light bands). Default true. */
  smoke?: boolean;
  /** Render a very subtle top edge highlight. Default true. */
  edge?: boolean;
  /** Render a micro-noise grain to break banding. Default true. */
  noise?: boolean;
  /** Render ambient shadow beneath the glass. Default true. */
  shadow?: boolean;
  /** Render physical thickness: subtle inner dark rim. Default true. */
  thickness?: boolean;
  /** When true, merge props onto the single child element instead of wrapping a div. */
  asChild?: boolean;
  /** Pass-through ref to the underlying DOM node. */
  innerRef?: React.Ref<HTMLElement>;
  /** @deprecated Use smoke instead */
  caustic?: boolean;
  /** @deprecated Use edge instead */
  specular?: boolean;
  /** @deprecated Reserved */
  fresnel?: boolean;
  /** @deprecated Reserved */
  dispersion?: boolean;
  /** @deprecated Reserved */
  innerGlow?: boolean;
}

const GLASS_CSS_VARS = {
  '--glass-light-x': '0.5',
  '--glass-light-y': '0.3',
  '--glass-light-intensity': '1',
  '--glass-fresnel': '0.18',
  '--glass-refraction-shift-x': '0px',
  '--glass-refraction-shift-y': '0px',
} as React.CSSProperties;

function GlassEffects({
  smoke,
  edge,
  noise,
  shadow,
  thickness,
}: {
  smoke: boolean;
  edge: boolean;
  noise: boolean;
  shadow: boolean;
  thickness: boolean;
}) {
  return (
    <>
      {shadow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-2 -inset-x-1 z-glass-below rounded-[inherit] opacity-50 blur-xl"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,0,0,0.35), transparent 70%)',
          }}
        />
      )}

      {/* 烟熏横向光带：模拟光线穿过深色毛玻璃形成的柔和横向模糊条带
          参考图中的效果：几条水平拉长的浅灰色模糊光带，不是白色光斑 */}
      {smoke && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit]"
          style={{
            background: `
              linear-gradient(180deg,
                transparent 0%,
                rgba(180,200,220,0.06) 8%,
                rgba(200,220,240,0.10) 12%,
                rgba(180,200,220,0.06) 16%,
                transparent 22%,
                transparent 42%,
                rgba(160,180,200,0.05) 48%,
                rgba(180,200,220,0.08) 52%,
                rgba(160,180,200,0.04) 58%,
                transparent 66%,
                transparent 78%,
                rgba(140,160,180,0.04) 84%,
                rgba(160,180,200,0.06) 88%,
                transparent 94%
              )
            `,
          }}
        />
      )}

      {/* 厚度感：极微弱的内阴影 + 边缘暗化，塑造玻璃的实体感 */}
      {thickness && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-thickness rounded-[inherit]"
          style={{
            boxShadow: `
              inset 0 0 0 0.5px rgba(180,200,220,0.12),
              inset 0 1px 2px rgba(0,0,0,0.15),
              inset 0 -1px 2px rgba(0,0,0,0.08)
            `,
          }}
        />
      )}

      {/* 顶部极微弱边缘光：一条非常细的浅灰色线，不是亮白色 */}
      {edge && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 z-glass-specular h-px rounded-full opacity-60"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(200,220,240,0.25) 30%, rgba(220,235,250,0.35) 50%, rgba(200,220,240,0.25) 70%, transparent)',
          }}
        />
      )}

      {noise && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-[0.025] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </>
  );
}

/**
 * 深色烟熏液态玻璃 — Smoked Liquid Glass
 *
 * 视觉特征（参考用户提供的毛玻璃效果）：
 * - 深色半透明灰黑底色，不是亮白透明
 * - 柔和的横向模糊光带（模拟光线穿过毛玻璃）
 * - 极微弱的顶部边缘细线
 * - 细腻的内阴影塑造厚度
 * - 无白色光斑、无强烈折射、无色散彩虹边
 */
const GlassLayer = React.forwardRef<HTMLElement, GlassLayerProps>(
  (
    {
      className,
      intensity = 'default',
      interactive = false,
      smoke = true,
      edge = true,
      noise = true,
      shadow = true,
      thickness = true,
      // Deprecated props - accept but ignore in favor of new defaults
      caustic: _caustic,
      specular: _specular,
      fresnel: _fresnel,
      dispersion: _dispersion,
      innerGlow: _innerGlow,
      asChild = false,
      trackMouse = false,
      trackScroll = false,
      trackOrientation = false,
      damping,
      maxShift,
      baseFresnel,
      innerRef,
      children,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const lightingRef = useGlassLighting<HTMLElement>({
      trackMouse,
      trackScroll,
      trackOrientation,
      damping,
      maxShift,
      baseFresnel,
    });

    const setRefs = React.useCallback(
      (node: HTMLElement | null) => {
        (lightingRef as React.MutableRefObject<HTMLElement | null>).current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
        if (typeof innerRef === 'function') {
          innerRef(node);
        } else if (innerRef) {
          (innerRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      [lightingRef, forwardedRef, innerRef],
    );

    const mergedStyle = React.useMemo(
      () => ({ ...GLASS_CSS_VARS, ...style } as React.CSSProperties),
      [style],
    );

    const effects = (
      <GlassEffects smoke={smoke} edge={edge} noise={noise} shadow={shadow} thickness={thickness} />
    );

    if (asChild) {
      const count = React.Children.count(children);
      if (count !== 1 || !React.isValidElement(children)) {
        return (
          <div
            ref={setRefs}
            className={cn(glassLayerVariants({ intensity, interactive }), className)}
            style={mergedStyle}
            {...props}
          >
            {effects}
            <div className="relative z-glass-content">{children}</div>
          </div>
        );
      }

      const child = children as React.ReactElement<
        React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>
      >;
      return React.cloneElement(
        child,
        {
          ref: setRefs,
          className: cn(glassLayerVariants({ intensity, interactive }), child.props.className, className),
          style: { ...mergedStyle, ...child.props.style },
          ...props,
          children: (
            <>
              {effects}
              <span className="relative z-glass-content">{child.props.children}</span>
            </>
          ),
        } as unknown as React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>,
      );
    }

    return (
      <div
        ref={setRefs}
        className={cn(glassLayerVariants({ intensity, interactive }), className)}
        style={mergedStyle}
        {...props}
      >
        {effects}
        <div className="relative z-glass-content">{children}</div>
      </div>
    );
  },
);
GlassLayer.displayName = 'GlassLayer';

export { GlassLayer };
