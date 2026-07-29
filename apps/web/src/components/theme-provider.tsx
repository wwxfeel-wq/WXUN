'use client';

import * as React from 'react';
import { initAuth } from '@/stores/auth-store';

/**
 * ThemeProvider
 *
 * Initializes client-side auth state on mount and applies the dark class
 * to the document root. The app is dark-first; this component keeps the
 * `dark` class in sync and warms up the persisted auth store before the
 * first API request.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    // Ensure the dark class is always present (dark-first design).
    document.documentElement.classList.add('dark');
    // Restore auth session from localStorage.
    initAuth();
  }, []);

  return <>{children}</>;
}
