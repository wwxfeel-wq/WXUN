'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className }, ref) => {
    return (
      <GlassLayer
        asChild
        intensity="subtle"
        interactive={false}
        caustic={false}
        specular={false}
        fresnel
        noise={false}
        shadow={false}
        trackMouse={false}
        trackScroll={false}
        innerRef={ref as React.Ref<HTMLElement>}
      >
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange?.(!checked)}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors',
            'focus-ring disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)]',
            className,
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'block h-6 w-6 rounded-full shadow-sm',
              'bg-text-inverse',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </GlassLayer>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
