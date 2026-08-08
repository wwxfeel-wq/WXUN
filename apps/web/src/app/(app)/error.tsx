'use client';

/**
 * R3-FE-010: Global error boundary for the (app) route group.
 *
 * Catches unhandled runtime errors in any page under (app) and shows a
 * user-friendly error message with a "retry" button. This prevents a
 * blank screen / white page when an unexpected error occurs.
 */
import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { GlassLayer } from '@/components/glass';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for debugging (could be sent to an error tracking service)
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <GlassLayer
        intensity="strong"
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl px-8 py-10 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error/15">
          <AlertCircle className="h-7 w-7 text-error" aria-hidden="true" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-lg font-semibold text-text">页面出错了</h1>
          <p className="max-w-xs text-sm leading-relaxed text-text-muted">
            抱歉，页面遇到了一些问题。您可以尝试重新加载，或者返回首页继续使用。
          </p>
        </div>

        {error.digest && (
          <p className="text-3xs text-text-subtle">错误代码：{error.digest}</p>
        )}

        <div className="flex w-full flex-col gap-2">
          <button
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-accent/90 focus-ring"
          >
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-gray-900)] px-5 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-[var(--color-gray-800)] hover:text-text focus-ring"
          >
            返回首页
          </button>
        </div>
      </GlassLayer>
    </div>
  );
}
