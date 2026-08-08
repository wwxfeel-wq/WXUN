'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastOptions {
  type: ToastType;
  message: string;
}

export type ToastFn = (options: ToastOptions) => void;

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type];
          const color = TOAST_COLORS[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 backdrop-blur-heavy shadow-glass-medium min-w-[260px] max-w-sm"
              style={{
                backgroundColor: 'var(--color-glass-strong)',
                border: `1px solid color-mix(in srgb, ${color}, transparent 65%)`,
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)` }}
              >
                <Icon size={15} style={{ color }} />
              </span>
              <p className="flex-1 text-sm text-text leading-relaxed pt-0.5">{t.message}</p>
              <button
                onClick={() => onDismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ type, message }: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 3000);
    },
    [dismiss],
  );

  const Toaster = React.useMemo(
    () => <ToastContainer toasts={toasts} onDismiss={dismiss} />,
    [toasts, dismiss],
  );

  return { toast, Toaster };
}

export { useToast };
