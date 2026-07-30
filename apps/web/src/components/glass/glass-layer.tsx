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
          'rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] backdrop-blur-glass',
        default:
          'rounded-2xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-strong)] backdrop-blur-extreme',
        strong:
          'rounded-3xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-extreme)] backdrop-blur-extreme',
        modal:
          'rounded-3xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-strong)] backdrop-blur-extreme',
      },
      interactive: {
        true: 'cursor-pointer hover:bg-[var(--color-glass-hover)] hover:border-[var(--color-glass-border-hover)] hover:shadow-glass-strong active:scale-[var(--state-active-scale)]',
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
  /** Render an additional caustic refraction tint layer. Default true. */
  caustic?: boolean;
  /** Render a subtle specular highlight bar. Default true. */
  specular?: boolean;
  /** Render a Fresnel edge rim using CSS masks. Default true. */
  fresnel?: boolean;
  /** Render a micro-noise grain to break banding. Default true. */
  noise?: boolean;
  /** Render ambient shadow beneath the glass. Default true. */
  shadow?: boolean;
  /** Render subtle dispersion on edges. Default false to stay restrained. */
  dispersion?: boolean;
  /** Render a physical thickness layer (inner shadow + edge highlight + inner dark rim). Default true. */
  thickness?: boolean;
  /** Render an inner liquid sheen / glow for extra volume. Default true. */
  innerGlow?: boolean;
  /** When true, merge props onto the single child element instead of wrapping a div. */
  asChild?: boolean;
  /** Pass-through ref to the underlying DOM node. */
  innerRef?: React.Ref<HTMLElement>;
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
  caustic,
  specular,
  fresnel,
  noise,
  shadow,
  dispersion,
  thickness,
  innerGlow,
}: Required<Pick<GlassLayerProps, 'caustic' | 'specular' | 'fresnel' | 'noise' | 'shadow' | 'dispersion' | 'thickness' | 'innerGlow'>>) {
  return (
    <>
      {shadow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-3 -inset-x-2 z-glass-below rounded-[inherit] opacity-70 blur-2xl"
          style={{
            background:
              'radial-gradient(ellipse 85% 65% at 50% 100%, var(--color-shadow), transparent 72%)',
          }}
        />
      )}

      {caustic && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-[0.92] mix-blend-screen"
          style={{
            background: `
              radial-gradient(ellipse 95% 70% at 16% 4%, var(--color-glass-shine-strong), transparent 50%),
              radial-gradient(ellipse 78% 55% at 92% 98%, var(--color-glass-shine-soft), transparent 40%),
              radial-gradient(ellipse 65% 48% at 78% 4%, var(--color-glass-tint-secondary), transparent 50%),
              radial-gradient(ellipse 70% 55% at 48% 52%, var(--color-glass-refraction-faint), transparent 58%),
              radial-gradient(ellipse 60% 40% at 6% 90%, var(--color-glass-tint-rose), transparent 54%),
              radial-gradient(ellipse 50% 35% at 64% 94%, var(--color-glass-tint-highlight), transparent 60%),
              radial-gradient(ellipse 55% 42% at 32% 96%, var(--color-glass-tint-primary), transparent 62%)
            `,
          }}
        />
      )}

      {innerGlow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-75"
          style={{
            background: `
              radial-gradient(ellipse 95% 70% at 22% 14%, color-mix(in srgb, var(--color-glass-shine-soft) 54%, transparent), transparent 52%),
              radial-gradient(ellipse 85% 65% at 84% 80%, color-mix(in srgb, var(--color-glass-tint-secondary) 42%, transparent), transparent 52%),
              radial-gradient(ellipse 70% 50% at 50% 50%, color-mix(in srgb, var(--color-glass-refraction-soft) 20%, transparent), transparent 64%),
              radial-gradient(ellipse 60% 40% at 72% 18%, color-mix(in srgb, var(--color-glass-tint-primary) 18%, transparent), transparent 68%)
            `,
          }}
        />
      )}

      {specular && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-10p top-0 z-glass-specular h-[3.5px] rounded-full opacity-95"
            style={{
              background: `linear-gradient(90deg, transparent, var(--color-glass-shine-soft) 14%, var(--color-glass-shine-strong) 42%, var(--color-glass-shine-soft) 86%, transparent)`,
              boxShadow: `0 0 28px color-mix(in srgb, var(--color-glass-shine-strong) 78%, transparent), 0 4px 14px color-mix(in srgb, var(--color-glass-shine-soft) 52%, transparent)`,
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-25 top-0 z-glass-specular h-[2px] rounded-full opacity-80"
            style={{
              background: `linear-gradient(90deg, transparent, var(--color-glass-shine-faint) 20%, var(--color-glass-shine-soft) 48%, var(--color-glass-shine-faint) 80%, transparent)`,
              boxShadow: `0 4px 18px color-mix(in srgb, var(--color-glass-shine-soft) 56%, transparent)`,
            }}
          />
        </>
      )}

      {thickness && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-thickness rounded-[inherit]"
          style={{
            boxShadow: `
              inset 0 0 0 0.5px var(--color-glass-edge-light),
              inset 0 0 0 2.5px var(--glass-thickness-inner-dark),
              inset 0 2px 6px var(--glass-thickness-inner-shadow),
              inset 0 0 32px color-mix(in srgb, var(--color-shadow) 34%, transparent)
            `,
          }}
        />
      )}

      {fresnel && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-fresnel rounded-[inherit] p-px"
          style={{
            background: `linear-gradient(
              155deg,
              color-mix(in srgb, var(--color-glass-edge-light) 95%, transparent) 0%,
              color-mix(in srgb, var(--color-glass-edge-soft) 52%, transparent) 22%,
              transparent 44%,
              color-mix(in srgb, var(--color-glass-edge-ghost) 42%, transparent) 66%,
              color-mix(in srgb, var(--color-glass-edge-faint) 72%, transparent) 100%
            )`,
            WebkitMask:
              'linear-gradient(var(--color-mask-pure) 0 0) content-box, linear-gradient(var(--color-mask-pure) 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      )}

      {dispersion && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-dispersion rounded-[inherit] p-px opacity-45"
          style={{
            background: `linear-gradient(
              160deg,
              var(--color-dispersion-red) 0%,
              var(--color-dispersion-green) 35%,
              var(--color-dispersion-blue) 70%,
              transparent 100%
            )`,
            WebkitMask:
              'linear-gradient(var(--color-mask-pure) 0 0) content-box, linear-gradient(var(--color-mask-pure) 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      )}

      {/* 默认开启极微弱的色散边缘，增强液态玻璃的真实感 */}
      {!dispersion && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-dispersion rounded-[inherit] p-px opacity-18"
          style={{
            background: `linear-gradient(
              165deg,
              var(--color-dispersion-red) 0%,
              transparent 30%,
              var(--color-dispersion-blue) 70%,
              transparent 100%
            )`,
            WebkitMask:
              'linear-gradient(var(--color-mask-pure) 0 0) content-box, linear-gradient(var(--color-mask-pure) 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      )}

      {noise && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </>
  );
}

/**
 * Foundational Liquid Glass surface.
 *
 * Combines:
 * - backdrop-filter blur + saturate
 * - environment reflection driven by pointer/scroll CSS variables
 * - Fresnel edge rim
 * - specular highlight
 * - caustic corner refraction tint
 * - micro noise texture
 * - ambient shadow
 *
 * All visual parameters reference design tokens.
 */
const GlassLayer = React.forwardRef<HTMLElement, GlassLayerProps>(
  (
    {
      className,
      intensity = 'default',
      interactive = false,
      caustic = true,
      specular = true,
      fresnel = true,
      noise = true,
      shadow = true,
      dispersion = false,
      thickness = true,
      innerGlow = true,
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
      <GlassEffects
        caustic={caustic}
        specular={specular}
        fresnel={fresnel}
        noise={noise}
        shadow={shadow}
        dispersion={dispersion}
        thickness={thickness}
        innerGlow={innerGlow}
      />
    );

    if (asChild) {
      const count = React.Children.count(children);
      // Fallback to a normal wrapper if children is not exactly one valid React element.
      // This prevents "React.Children.only expected to receive a single React element child"
      // crashes when data is loading, null, or a fragment/array.
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
