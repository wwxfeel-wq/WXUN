'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassLayer, type GlassLayerProps } from './glass-layer';

const glassButtonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm font-medium select-none',
    'transition-[transform,box-shadow,filter] duration-200 ease-spring',
    'focus-ring disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)]',
    'active:scale-[var(--state-active-scale)]',
    'hover:brightness-105 active:brightness-95',
  ],
  {
    variants: {
      variant: {
        primary:
          'text-text-inverse [--glass-fresnel:0.22]',
        secondary:
          'text-text',
        ghost:
          'text-text-muted hover:text-text bg-transparent backdrop-blur-none border-transparent shadow-none',
        outline:
          'text-text bg-transparent backdrop-blur-none border-[var(--color-glass-border-strong)] hover:border-[var(--color-glass-border-hover)] hover:bg-[var(--color-glass-hover)] shadow-none',
        danger:
          'text-text-inverse [--glass-fresnel:0.22]',
      },
      size: {
        sm: 'h-9 px-3.5 text-xs rounded-xl',
        md: 'h-11 px-5 text-sm rounded-xl',
        lg: 'h-12 px-7 text-base rounded-2xl py-3.5',
        icon: 'h-10 w-10 p-0 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type GlassButtonVariant = VariantProps<typeof glassButtonVariants>['variant'];

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants>,
    Pick<GlassLayerProps, 'damping' | 'maxShift' | 'baseFresnel' | 'trackMouse' | 'trackScroll'> {
  loading?: boolean;
}

/**
 * Liquid Glass button.
 *
 * Primary and danger variants render a tinted glass body with primary or
 * rose gradients. Secondary, ghost and outline variants stay transparent
 * to fit quiet family UI surfaces.
 */
const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      children,
      damping,
      maxShift,
      baseFresnel,
      trackMouse = false,
      trackScroll = false,
      ...props
    },
    ref,
  ) => {
    const isTinted = variant === 'primary' || variant === 'danger';
    const isTransparent = variant === 'ghost' || variant === 'outline';
    const isDisabled = disabled || loading;

    // Tinted 按钮的启用/禁用状态用完全不同的视觉：
    // - 启用：饱和的实色主色 + 强光晕 + 白字，明显"点亮"
    // - 禁用：极淡的玻璃残影 + 弱字
    const tintedStyle: React.CSSProperties | undefined = isTinted
      ? isDisabled
        ? {
            backgroundColor: 'var(--color-mask-transparent)',
            backgroundImage:
              variant === 'primary'
                ? `linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 18%, var(--color-glass-strong)) 0%, color-mix(in srgb, var(--color-primary) 6%, var(--color-glass-strong)) 100%)`
                : `linear-gradient(135deg, color-mix(in srgb, var(--color-error) 18%, var(--color-glass-strong)) 0%, color-mix(in srgb, var(--color-error) 6%, var(--color-glass-strong)) 100%)`,
          }
        : {
            backgroundColor:
              variant === 'primary' ? 'var(--color-primary)' : 'var(--color-error)',
            backgroundImage:
              variant === 'primary'
                ? `linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 100%, transparent) 0%, color-mix(in srgb, var(--color-primary-hover) 90%, transparent) 100%)`
                : `linear-gradient(135deg, var(--color-error) 0%, color-mix(in srgb, var(--color-error) 88%, white) 100%)`,
            boxShadow:
              variant === 'primary'
                ? `0 8px 24px -6px var(--color-primary-glow), 0 0 0 0.5px color-mix(in srgb, var(--color-primary) 60%, transparent) inset, 0 1px 0 color-mix(in srgb, white 30%, transparent) inset`
                : `0 8px 24px -6px color-mix(in srgb, var(--color-error) 45%, transparent), 0 0 0 0.5px color-mix(in srgb, var(--color-error) 60%, transparent) inset, 0 1px 0 color-mix(in srgb, white 30%, transparent) inset`,
          }
      : undefined;

    return (
      <GlassLayer
        ref={ref as React.Ref<HTMLElement>}
        asChild
        intensity={isTinted ? 'strong' : 'subtle'}
        interactive={!isTransparent}
        caustic={isTinted && !isDisabled}
        specular={!isTransparent}
        fresnel={!isTransparent}
        noise={false}
        shadow={isTinted && !isDisabled}
        thickness={!isTransparent}
        damping={damping}
        maxShift={maxShift}
        baseFresnel={baseFresnel}
        trackMouse={trackMouse}
        trackScroll={trackScroll}
        className={cn(
          glassButtonVariants({ variant, size }),
          isTinted && !isDisabled && 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.15)]',
          className,
        )}
        style={tintedStyle}
      >
        <button disabled={disabled || loading} aria-busy={loading} {...props}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {children}
        </button>
      </GlassLayer>
    );
  },
);
GlassButton.displayName = 'GlassButton';

export { GlassButton, glassButtonVariants };
