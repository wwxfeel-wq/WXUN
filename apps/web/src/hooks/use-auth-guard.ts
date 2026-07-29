'use client';

/**
 * useAuthGuard - guards protected routes.
 *
 * Waits for the persisted auth store to rehydrate, then redirects to /login
 * if the user is not authenticated. Returns a ready flag so callers can show
 * a loader until the guard resolves.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export function useAuthGuard(): { ready: boolean; authenticated: boolean } {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [hydrated, isAuthenticated, router]);

  return { ready, authenticated: isAuthenticated };
}
