'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** Wrapper class for layout control. */
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      wrapperClassName,
      label,
      error,
      hint,
      icon: Icon,
      iconRight: IconRight,
      id,
      type = 'text',
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hasError = Boolean(error);

    return (
      <div className={cn('w-full space-y-2', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-text tracking-wide"
          >
            {label}
          </label>
        )}
        <GlassLayer
          intensity="subtle"
          caustic={false}
          specular
          fresnel
          thickness
          shadow={false}
          className={cn(
            'relative flex h-12 w-full items-center overflow-hidden rounded-xl',
            'transition-all duration-200 ease-spring',
            'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-glass-strong',
            hasError && 'border-error/60 focus-within:border-error focus-within:ring-error/40',
          )}
        >
          {Icon && (
            <Icon
              className="pointer-events-none ml-4 h-[18px] w-[18px] shrink-0 text-text-muted"
              aria-hidden="true"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={cn(
              'relative z-local-above h-full w-full flex-1 bg-transparent px-4 text-base text-text placeholder:text-text-muted',
              'focus:outline-none',
              Icon && 'pl-3',
              IconRight && 'pr-3',
              className,
            )}
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {IconRight && (
            <IconRight
              className="pointer-events-none mr-4 h-[18px] w-[18px] shrink-0 text-text-muted"
              aria-hidden="true"
            />
          )}
        </GlassLayer>
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-error font-medium">
            {error}
          </p>
        ) : hint ? (
          <p className="text-sm text-text-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
