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
      {/* 外阴影：参考图风格 — 大范围柔和阴影 + 绿色环境辉光 */}
      {shadow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-3 -inset-x-2 z-glass-below rounded-[inherit] opacity-60 blur-2xl"
          style={{
            background:
              'radial-gradient(ellipse 90% 80% at 50% 100%, rgba(0,0,0,0.50), transparent 70%)',
          }}
        />
      )}

      {/* 顶部高光渐变：参考图核心效果 — 顶部亮、底部暗
          模拟光源从上方照射玻璃表面，高光集中在顶部 15% */}
      {smoke && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit]"
          style={{
            background: `linear-gradient(180deg,
              rgba(255,255,255,0.18) 0%,
              rgba(255,255,255,0.08) 8%,
              rgba(255,255,255,0.02) 18%,
              transparent 30%,
              transparent 85%,
              rgba(0,0,0,0.10) 100%
            )`,
          }}
        />
      )}

      {/* 厚度感：参考图双层内阴影
          第一层：顶部内高光 + 底部内暗影 = 凸面玻璃
          第二层：1px 白色内边框 = 玻璃切面 */}
      {thickness && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-glass-thickness rounded-[inherit]"
            style={{
              boxShadow: `
                inset 0 1px 1px rgba(255,255,255,0.15),
                inset 0 -1px 2px rgba(0,0,0,0.12),
                inset 0 0 0 1px rgba(255,255,255,0.08)
              `,
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-glass-thickness rounded-[inherit]"
            style={{
              boxShadow: `
                inset 0 0 0 0.5px rgba(255,255,255,0.05),
                inset 1px 0 3px -1px rgba(0,0,0,0.08),
                inset -1px 0 3px -1px rgba(0,0,0,0.08)
              `,
            }}
          />
        </>
      )}

      {/* 顶部边缘高光：参考图标志性细亮线
          模拟玻璃切面顶部反光，中间最亮向两端渐隐 */}
      {edge && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-0 z-glass-specular h-px rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.25) 10%, rgba(255,255,255,0.50) 50%, rgba(255,255,255,0.25) 90%, transparent)',
          }}
        />
      )}

      {/* 微弱噪点纹理：防止色带，增加材质真实感 */}
      {noise && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-[0.015] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </>
  );
}

/**
 * Apple Liquid Glass — 浅色毛玻璃
 *
 * 视觉特征（完全复刻 Apple Liquid Glass）：
 * - 白色半透明底色，背景透过但高度模糊
 * - 顶部高光渐变（亮白→透明），模拟光线从上方照射
 * - 顶部边缘细亮线，模拟玻璃切面反光
 * - 内阴影塑造玻璃厚度（顶部内高光 + 底部内暗影）
 * - 柔和的外阴影提供悬浮感
 * - 微弱噪点纹理防止色带
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
              <div className="relative z-glass-content">{child.props.children}</div>
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
