'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import FloatingDock from './floating-dock';
import InkDrop from '../ink/ink-drop';
import BackgroundAmbient from '../effects/background-ambient';
import { useAuthStore, initAuth } from '@/stores/auth-store';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);

  // Admin pages are operational contexts; hide the family-facing ShiMo companion.
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      // R3-FE-028: Preserve the original path so login can redirect back.
      router.replace('/login?redirect=' + encodeURIComponent(pathname));
    }
  }, [hydrated, isAuthenticated, router, pathname]);

  // R3-FE-029: Return a loading spinner instead of null during auth check.
  if (!hydrated || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-base flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-accent/50"
              style={{
                animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen bg-background">
      {/* Ambient background — 所有页面统一显示 */}
      <div className="fixed inset-0 z-base">
        <BackgroundAmbient />
      </div>

      {/* Main content area */}
      <main className="relative z-base w-full min-h-screen">
        {children}
      </main>

      {/* Floating Dock — 所有页面统一显示 */}
      <FloatingDock />

      {/* Ink Drop (时墨) — 家庭陪伴入口，在管理后台隐藏 */}
      {!isAdminRoute && <InkDrop />}
    </div>
  );
}
