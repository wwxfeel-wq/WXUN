'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { GlassButton, type GlassButtonProps } from '@/components/glass';

const buttonVariants = cva('', {
  variants: {
    variant: {
      primary: '',
      secondary: '',
      ghost: '',
      outline: '',
      glass: '',
      danger: '',
    },
    size: {
      sm: '',
      md: '',
      lg: '',
      icon: '',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export interface ButtonProps extends Omit<GlassButtonProps, 'variant'> {
  /** Legacy variant alias. Prefer GlassButton variant names directly. */
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

/**
 * Backward-compatible button now backed by the Liquid Glass pipeline.
 *
 * All glass-like variants render real Apple-style Liquid Glass with dynamic
 * lighting. The legacy `glass` variant is mapped to `secondary`.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    const glassVariant: GlassButtonProps['variant'] =
      variant === 'glass' ? 'secondary' : variant ?? 'primary';

    return (
      <GlassButton
        ref={ref}
        variant={glassVariant}
        size={size}
        loading={loading}
        disabled={disabled}
        className={cn(className)}
        {...props}
      >
        {children}
      </GlassButton>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
