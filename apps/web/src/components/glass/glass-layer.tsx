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
          'rounded-2xl border border-[var(--color-glass-border-strong)] bg-[var(--color-glass-strong)] backdrop-blur-heavy',
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
  /** Render a physical thickness layer (inner shadow + 0.5px edge highlight + 1px inner dark rim). Default true. */
  thickness?: boolean;
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
}: Required<Pick<GlassLayerProps, 'caustic' | 'specular' | 'fresnel' | 'noise' | 'shadow' | 'dispersion' | 'thickness'>>) {
  return (
    <>
      {shadow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-2 -inset-x-1 z-glass-below rounded-[inherit] opacity-60 blur-xl"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 100%, var(--color-shadow), transparent 70%)',
          }}
        />
      )}

      {caustic && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-30 mix-blend-screen"
          style={{
            background: `
              radial-gradient(ellipse 60% 40% at 30% 0%, var(--color-glass-shine-medium), transparent 65%),
              radial-gradient(ellipse 50% 30% at 80% 100%, var(--color-glass-shine-dim), transparent 60%)
            `,
          }}
        />
      )}

      {specular && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10p top-0 z-glass-specular h-px rounded-full opacity-60"
          style={{
            background: `linear-gradient(90deg, transparent, var(--color-glass-shine-dim) 30%, var(--color-glass-shine-medium) 50%, var(--color-glass-shine-dim) 70%, transparent)`,
          }}
        />
      )}

      {thickness && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-thickness rounded-[inherit]"
          style={{
            boxShadow: `
              inset 0 0 0 0.5px var(--glass-thickness-edge),
              inset 0 0 0 1.5px var(--glass-thickness-inner-dark),
              inset 0 1px 2px var(--glass-thickness-inner-shadow)
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
              color-mix(in srgb, var(--color-glass-edge-light) 60%, transparent) 0%,
              color-mix(in srgb, var(--color-glass-edge-subtle) 20%, transparent) 28%,
              transparent 45%,
              color-mix(in srgb, var(--color-glass-edge-micro) 20%, transparent) 68%,
              color-mix(in srgb, var(--color-glass-edge-faint) 40%, transparent) 100%
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
          className="pointer-events-none absolute inset-0 z-glass-dispersion rounded-[inherit] p-px opacity-30"
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

      {noise && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-glass-below rounded-[inherit] opacity-[0.035] mix-blend-overlay"
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
      />
    );

    if (asChild) {
      const child = React.Children.only(children) as React.ReactElement<
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
