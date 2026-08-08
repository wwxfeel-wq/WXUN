'use client';

/**
 * useNotifications - SWR-backed notification list with optimistic read updates.
 */
import { useCallback } from 'react';
import useSWR from 'swr';
import { apiClient, swrFetcher } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { PaginatedResponse } from '@echolife/shared';
import type { AppNotification } from '@echolife/shared';

const NOTIFICATIONS_KEY = '/notifications?pageSize=20';

export function useNotifications() {
  const { data, mutate, isLoading } = useSWR<PaginatedResponse<AppNotification>>(
    NOTIFICATIONS_KEY,
    swrFetcher,
    { revalidateOnFocus: false, refreshInterval: 60000 },
  );

  // R3-FE-033: Use toast to show errors when markRead/markAllRead fail.
  const { toast, Toaster } = useToast();

  const notifications = data?.items ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback(
    (id: string) => {
      // Optimistic update
      mutate(
        (current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((n) =>
              n.id === id ? { ...n, read: true } : n,
            ),
          };
        },
        false,
      );
      void apiClient.patch(`/notifications/${id}/read`).catch(() => {
        // Revert on failure
        void mutate();
        // R3-FE-033: Show toast notification on failure.
        toast({ type: 'error', message: '标记已读失败，请稍后重试' });
      });
    },
    [mutate, toast],
  );

  const markAllRead = useCallback(() => {
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((n) => ({ ...n, read: true })),
        };
      },
      false,
    );
    void apiClient.patch('/notifications/read-all').catch(() => {
      void mutate();
      // R3-FE-033: Show toast notification on failure.
      toast({ type: 'error', message: '全部标记已读失败，请稍后重试' });
    });
  }, [mutate, toast]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh: mutate,
    // R3-FE-033: Toaster element that must be rendered by consuming components.
    Toaster,
  };
}
