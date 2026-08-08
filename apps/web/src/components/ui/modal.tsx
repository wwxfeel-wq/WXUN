'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Hide the close button in the header. */
  hideCloseButton?: boolean;
  /** Prevent closing when clicking the backdrop. */
  disableBackdropClose?: boolean;
  /** Prevent closing when pressing the Escape key. */
  disableEscapeClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  hideCloseButton = false,
  disableBackdropClose = false,
  disableEscapeClose = false,
}: ModalProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  // Focus trap: capture focus on open, cycle Tab within the dialog, restore on close
  React.useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the modal
    const focusable = contentRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    } else {
      // Fall back to focusing the dialog container itself
      contentRef.current?.focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!contentRef.current) return;
      const focusableEls = contentRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  // Close on Escape key (decoupled from disableBackdropClose)
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableEscapeClose) onClose();
    };
    window.addEventListener('keydown', handler);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, disableEscapeClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="button"
            aria-label="关闭"
            tabIndex={0}
            onClick={() => {
              if (!disableBackdropClose) onClose();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disableBackdropClose) onClose();
            }}
          />
          {/* Dialog */}
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn('relative w-full max-w-lg max-h-90vh overflow-hidden outline-none', className)}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <GlassLayer intensity="modal" className="max-h-90vh overflow-hidden">
              {(title || !hideCloseButton) && (
                <div className="relative z-local-above flex items-start justify-between gap-4 border-b border-border p-6 pb-4">
                  <div className="space-y-1">
                    {title && (
                      <h2
                        id={titleId}
                        className="text-lg font-semibold text-text"
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="text-sm text-text-muted">{description}</p>
                    )}
                  </div>
                  {!hideCloseButton && (
                    <button
                      onClick={onClose}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-ring"
                      aria-label="关闭"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
              <div className="relative z-local-above overflow-y-auto p-6 max-h-vh-minus-12rem">
                {children}
              </div>
              {footer && (
                <div className="relative z-local-above flex items-center justify-end gap-3 border-t border-border p-6 pt-4">
                  {footer}
                </div>
              )}
            </GlassLayer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
