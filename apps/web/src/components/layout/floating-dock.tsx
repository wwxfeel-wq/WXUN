'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  MessagesSquare,
  Orbit,
  Sparkles,
  Settings,
  LogOut,
  Users,
  GraduationCap,
  Cpu,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { GlassLayer } from '@/components/glass';

/**
 * visionOS Floating Dock 入口
 * 6 项核心功能 + 用户头像（含设置入口）
 */
const dockItems = [
  { id: 'home', icon: Home, label: '首页', href: '/' },
  { id: 'interview', icon: MessagesSquare, label: '陪伴', href: '/interview' },
  { id: 'life-core', icon: Orbit, label: '生命核心', href: '/life-tree' },
  { id: 'center', icon: Sparkles, label: '回忆', href: '/center' },
  { id: 'devices', icon: Cpu, label: '设备', href: '/devices' },
  { id: 'skills', icon: GraduationCap, label: '能力', href: '/skills' },
  { id: 'family', icon: Users, label: '家庭', href: '/family' },
];

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25, mass: 0.6 };

export default function FloatingDock() {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const dockRef = useRef<HTMLDivElement>(null);
  const mouseXRef = useRef<number | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  const handleLogout = useCallback(() => {
    logout();
    router.push('/login');
  }, [logout, router]);

  const handleNavigate = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  // Detect touch device to disable magnification
  useEffect(() => {
    setIsTouchDevice(
      'ontouchstart' in window || navigator.maxTouchPoints > 0,
    );
  }, []);

  // Global mouse tracking - desktop only
  useEffect(() => {
    if (isTouchDevice) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dockRef.current) return;
      const rect = dockRef.current.getBoundingClientRect();
      const margin = 80;
      if (
        e.clientX >= rect.left - margin &&
        e.clientX <= rect.right + margin &&
        e.clientY >= rect.top - margin &&
        e.clientY <= rect.bottom + margin
      ) {
        mouseXRef.current = e.clientX - rect.left;
      } else {
        mouseXRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setMouseX(mouseXRef.current);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isTouchDevice]);

  const getScale = (index: number, total: number) => {
    if (isTouchDevice || mouseX === null) return 1;
    if (!dockRef.current) return 1;
    const rect = dockRef.current.getBoundingClientRect();
    const itemWidth = rect.width / total;
    const itemCenter = itemWidth * index + itemWidth / 2;
    const distance = Math.abs(mouseX - itemCenter);
    const maxDistance = itemWidth * 2.5;
    if (distance > maxDistance) return 1;
    const t = distance / maxDistance;
    const scale = 1 + 0.5 * Math.pow(1 - t, 2.5);
    return Math.min(scale, 1.6);
  };

  const getY = (index: number, total: number) => {
    if (isTouchDevice || mouseX === null) return 0;
    const scale = getScale(index, total);
    return -(scale - 1) * 20;
  };

  return (
    <>
      <div className="fixed inset-x-0 z-fixed flex justify-center pointer-events-none px-2"
        style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <GlassLayer
          intensity="default"
          className="pointer-events-auto !overflow-x-auto max-w-2xl"
        >
          <motion.nav
            ref={dockRef}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="floating-dock flex items-end w-full no-scrollbar gap-1 sm:gap-1 px-2 sm:px-5 pt-2 sm:pt-4 pb-2 sm:pb-2.5"
          >
            {dockItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const scale = getScale(index, dockItems.length + 1);
            const y = getY(index, dockItems.length + 1);

            return (
              <motion.button
                key={item.id}
                onClick={() => handleNavigate(item.href)}
                className="relative flex flex-col items-center justify-end shrink-0 cursor-pointer px-1.5 sm:px-1.5 pb-0.5 bg-transparent border-0 outline-none origin-bottom select-none focus-ring"
                animate={{ scale, y }}
                transition={SPRING}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                whileTap={isTouchDevice ? { scale: 0.88 } : undefined}
              >
                <div
                  className={cn(
                    'relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl',
                    'transition-colors duration-200',
                    isActive
                      ? 'bg-glass-strong text-accent'
                      : 'text-text-muted hover:bg-glass-hover hover:text-text',
                  )}
                >
                  <Icon size={20} strokeWidth={1.5} className="sm:hidden" />
                  <Icon size={22} strokeWidth={1.5} className="hidden sm:block" />
                </div>

                {isActive && (
                  <motion.div
                    layoutId="dock-indicator"
                    className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-accent"
                    transition={SPRING}
                  />
                )}

                <motion.span
                  className="text-2xs sm:text-3xs text-text-subtle mt-0.5 whitespace-nowrap"
                  animate={{ opacity: scale > 1.15 ? 1 : 0.6 }}
                >
                  {item.label}
                </motion.span>
              </motion.button>
            );
          })}

          <div className="w-px h-6 sm:h-7 bg-border mx-1.5 mb-2.5 shrink-0" />

          <motion.button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="relative flex flex-col items-center justify-end shrink-0 cursor-pointer px-1.5 sm:px-1.5 pb-0.5 bg-transparent border-0 outline-none origin-bottom select-none focus-ring"
            animate={{
              scale: getScale(dockItems.length, dockItems.length + 1),
              y: getY(dockItems.length, dockItems.length + 1),
            }}
            transition={SPRING}
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            whileTap={isTouchDevice ? { scale: 0.88 } : undefined}
          >
            <div className="w-11 h-11 sm:w-11 sm:h-11 rounded-xl sm:rounded-xl bg-accent/15 flex items-center justify-center text-accent text-sm sm:text-xs font-medium">
              {user?.profile?.nickname?.charAt(0) || 'U'}
            </div>
            <span className="text-2xs sm:text-3xs text-text-subtle mt-0.5 opacity-60">
              我
            </span>
          </motion.button>
        </motion.nav>
        </GlassLayer>
      </div>

      <AnimatePresence>
        {showUserDropdown && (
          <GlassLayer
            intensity="default"
            className="fixed right-3 sm:right-6 z-popover p-3 sm:p-4 w-56 sm:w-56"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={SPRING}
            >
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center text-accent text-sm font-medium">
                {user?.profile?.nickname?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{user?.profile?.nickname || '用户'}</div>
                <div className="text-xs text-text-subtle truncate">{user?.email || ''}</div>
              </div>
            </div>
            <button
              onClick={() => { handleNavigate('/settings'); setShowUserDropdown(false); }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-text-muted hover:bg-surface hover:text-text transition-colors focus-ring min-h-11"
            >
              <Settings size={16} />
              设置
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error-bg transition-colors focus-ring min-h-11"
            >
              <LogOut size={16} />
              退出登录
            </button>
            </motion.div>
          </GlassLayer>
        )}
      </AnimatePresence>
    </>
  );
}
