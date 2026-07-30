'use client';

/**
 * Global error boundary for the (app) route group.
 * Catches client-side exceptions and shows a recoverable error UI
 * instead of Next.js's default white-screen "Application error" page.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GlassLayer } from '@/components/glass';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for debugging
    console.error('[AppErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <GlassLayer intensity="strong" className="max-w-md p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error/10 text-error">
            <AlertTriangle size={28} />
          </div>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-text">
          页面出了点问题
        </h2>
        <p className="mb-1 text-sm text-text-muted">
          {error.message || '发生了未知错误'}
        </p>
        {error.digest && (
          <p className="mb-4 text-xs text-text-subtle">
            错误代码：{error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="primary"
            onClick={reset}
            className="gap-2"
          >
            <RotateCcw size={15} />
            重试
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.location.href = '/'}
            className="gap-2"
          >
            <Home size={15} />
            回首页
          </Button>
        </div>
      </GlassLayer>
    </div>
  );
}
