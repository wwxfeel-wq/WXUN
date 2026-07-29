'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  options?: SelectOption[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { className, label, error, hint, id, options, children, ...props },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    const hasError = Boolean(error);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-text"
          >
            {label}
          </label>
        )}
        <GlassLayer
          intensity="subtle"
          caustic={false}
          specular={false}
          shadow={false}
          className={cn(
            'relative flex h-11 items-center overflow-hidden rounded-xl',
            hasError && 'border-error/60',
          )}
        >
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'relative z-local-above h-full w-full flex-1 cursor-pointer bg-transparent px-4 pr-10 text-sm text-text focus:outline-none',
              className,
            )}
            aria-invalid={hasError}
            aria-describedby={error ? `${selectId}-error` : undefined}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3.5 z-local-above h-4 w-4 text-text-muted"
            aria-hidden="true"
          />
        </GlassLayer>
        {error ? (
          <p id={`${selectId}-error`} className="text-xs text-error">
            {error}
          </p>
        ) : hint ? (
          <p className="text-xs text-text-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
