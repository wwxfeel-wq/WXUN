'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, getInitials } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-3xs',
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
        '2xl': 'h-20 w-20 text-2xl',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string | null;
  name?: string;
  /** Show a status dot in the bottom-right corner. */
  status?: 'online' | 'offline' | 'busy';
}

const statusColors: Record<NonNullable<AvatarProps['status']>, string> = {
  online: 'bg-success',
  offline: 'bg-text-muted',
  busy: 'bg-error',
};

export function Avatar({
  className,
  size,
  src,
  name = '',
  status,
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = src && !imgError;
  const initials = getInitials(name);

  return (
    <span className={cn('relative inline-block', className)} {...props}>
      <GlassLayer
        asChild
        intensity="subtle"
        caustic={false}
        specular={false}
        shadow={false}
        trackMouse={false}
        trackScroll={false}
        className={cn(avatarVariants({ size }), '!rounded-full bg-surface-hover text-text')}
      >
        <span>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={name || '头像'}
              className="relative z-local-above h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="relative z-local-above gradient-primary-text font-semibold">{initials}</span>
          )}
        </span>
      </GlassLayer>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
            statusColors[status],
          )}
        />
      )}
    </span>
  );
}

export { avatarVariants };
