import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

/** A spinning loader icon. */
export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 className={cn('animate-spin text-accent', className)} style={{ width: size, height: size }} />;
}

/** A full-screen centered loading indicator. */
export function FullScreenLoader({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex min-h-60vh w-full flex-col items-center justify-center gap-4">
      <Spinner size={32} />
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  );
}

/** A skeleton block for content placeholders. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

/** Skeleton for a card with header lines and body lines. */
export function CardSkeleton() {
  return (
    <GlassLayer intensity="default" className="p-6 space-y-4">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </GlassLayer>
  );
}

/** A grid of card skeletons. */
export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Inline dots loading indicator. */
export function TypingDots() {
  return (
    <div className="flex items-center gap-1" aria-label="正在输入">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-text-muted"
          style={{
            animation: 'pulseSoft 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
