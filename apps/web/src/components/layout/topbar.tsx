'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  Bell,
  Search,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotifications } from '@/hooks/use-notifications';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GlassLayer } from '@/components/glass';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { AppNotification } from '@echolife/shared';

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { notifications, unreadCount, markAllRead, markRead, Toaster } = useNotifications();

  const [notifOpen, setNotifOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const [searchFocused, setSearchFocused] = React.useState(false);

  const notifRef = React.useRef<HTMLDivElement>(null);
  const userRef = React.useRef<HTMLDivElement>(null);

  // Close menus on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/museum?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <GlassLayer
      asChild
      intensity="strong"
      caustic={false}
      shadow={false}
      className="sticky top-0 z-sticky"
    >
      <header className="flex h-16 items-center gap-3 border-b border-border px-4 lg:px-6">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-glass-hover hover:text-text focus-ring lg:hidden"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Page title */}
        <h1 className="text-base font-semibold text-text sm:text-lg">{title}</h1>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="hidden sm:block">
            <GlassLayer
              intensity="subtle"
              caustic={false}
              specular={false}
              shadow={false}
              className={cn(
                'relative flex h-10 items-center overflow-hidden transition-[background-color,border-color,box-shadow] duration-200',
                searchFocused ? 'w-64 border-accent' : 'w-48 border-border',
              )}
            >
              <Search className="ml-3 h-4 w-4 text-text-muted" />
              <input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="搜索记忆..."
                aria-label="搜索记忆"
                className="relative z-local-above ml-2 h-full w-full bg-transparent pr-3 text-sm text-text placeholder:text-text-muted/60 focus:outline-none"
              />
            </GlassLayer>
          </form>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                if (!notifOpen && unreadCount > 0) {
                  // Mark all read when opening
                  void markAllRead();
                }
              }}
              className="relative rounded-lg p-2 text-text-muted transition-colors hover:bg-glass-hover hover:text-text focus-ring"
              aria-label="通知"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-3xs font-bold text-text-inverse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 z-popover w-80 overflow-hidden p-0"
                >
                  <GlassLayer intensity="strong" className="max-h-80vh overflow-hidden">
                    <div className="relative z-local-above flex items-center justify-between border-b border-border px-4 py-3">
                      <span className="text-sm font-semibold text-text">通知</span>
                      {unreadCount > 0 && (
                        <Badge variant="accent">{unreadCount} 条未读</Badge>
                      )}
                    </div>
                    <div className="relative z-local-above max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex h-24 items-center justify-center text-sm text-text-muted">
                          暂无通知
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n) => (
                          <NotificationItem
                            key={n.id}
                            notification={n}
                            onRead={() => markRead(n.id)}
                          />
                        ))
                      )}
                    </div>
                  </GlassLayer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User menu */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-glass-hover focus-ring"
            >
              <Avatar
                src={user?.profile.avatarUrl}
                name={user?.profile.nickname}
                size="sm"
              />
              <span className="hidden text-sm font-medium text-text sm:inline">
                {user?.profile.nickname}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-text-muted sm:inline" />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 z-popover w-56 overflow-hidden p-0"
                >
                  <GlassLayer intensity="strong" className="overflow-hidden">
                    <div className="relative z-local-above border-b border-border px-4 py-3">
                      <p className="truncate text-sm font-medium text-text">
                        {user?.profile.nickname}
                      </p>
                      <p className="truncate text-xs text-text-muted">{user?.email}</p>
                    </div>
                    <div className="relative z-local-above p-1.5">
                      <MenuItem href="/settings" icon={User} label="个人资料" />
                      <MenuItem href="/settings" icon={Settings} label="设置" />
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-error transition-colors hover:bg-error-bg focus-ring"
                      >
                        <LogOut className="h-4 w-4" />
                        退出登录
                      </button>
                    </div>
                  </GlassLayer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      {Toaster}
    </GlassLayer>
  );
}

function MenuItem({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text transition-colors hover:bg-glass-hover focus-ring"
    >
      <Icon className="h-4 w-4 text-text-muted" />
      {label}
    </Link>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: () => void;
}) {
  return (
    <button
      onClick={onRead}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-glass-hover focus-ring',
        !notification.read && 'bg-glass',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">{notification.title}</span>
        {!notification.read && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        )}
      </div>
      <p className="line-clamp-2 text-xs text-text-muted">{notification.body}</p>
      <span className="text-3xs text-text-muted/70">
        {formatRelativeTime(notification.createdAt)}
      </span>
    </button>
  );
}
