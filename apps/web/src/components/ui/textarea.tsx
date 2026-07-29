'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const hasError = Boolean(error);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
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
            'relative w-full overflow-hidden rounded-xl',
            hasError && 'border-error/60 focus-within:border-error focus-within:ring-error/40',
          )}
        >
          <textarea
            ref={ref}
            id={textareaId}
            className={cn(
              'relative z-local-above min-h-24 w-full bg-transparent px-4 py-3 text-sm text-text placeholder:text-text-muted/60',
              'resize-y focus:outline-none',
              className,
            )}
            aria-invalid={hasError}
            {...props}
          />
        </GlassLayer>
        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : hint ? (
          <p className="text-xs text-text-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
