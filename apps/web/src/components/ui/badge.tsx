import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'text-text-muted',
        accent: 'text-accent',
        success: 'text-success',
        warning: 'text-warning',
        error: 'text-error',
        outline: 'text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Optional color override as a hex string (used for emotion tags). */
  color?: string;
}

export function Badge({ className, variant, color, style, children, ...props }: BadgeProps) {
  const customStyle: React.CSSProperties = { ...style };
  if (color) {
    customStyle.borderColor = `color-mix(in srgb, ${color} 30%, transparent)`;
    customStyle.backgroundColor = `color-mix(in srgb, ${color} 10%, transparent)`;
    customStyle.color = color;
  }
  return (
    <GlassLayer
      asChild
      intensity="subtle"
      caustic={false}
      specular={false}
      shadow={false}
      trackMouse={false}
      trackScroll={false}
    >
      <span
        className={cn(badgeVariants({ variant }), className)}
        style={customStyle}
        {...props}
      >
        {children}
      </span>
    </GlassLayer>
  );
}

export { badgeVariants };
