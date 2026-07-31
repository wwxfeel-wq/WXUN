'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import FloatingDock from './floating-dock';
import EmotionWaveBar from './emotion-wave-bar';
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

  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  useEffect(() => {
    if (hydrated && !isAuthenticated && !isLocalhost) {
      router.push('/login');
    }
  }, [hydrated, isAuthenticated, isLocalhost, router]);

  // Local development bypasses auth so the UI can be previewed without the API.
  const bypassAuth = isLocalhost;
  if (!bypassAuth && (!hydrated || !isAuthenticated)) return null;

  return (
    <div className="relative w-full min-h-screen bg-background">
      {/* 全局情感波形条 — 所有页面顶部常驻显示 */}
      <EmotionWaveBar />

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
