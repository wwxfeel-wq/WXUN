'use client';

/**
 * useNotifications - SWR-backed notification list with optimistic read updates.
 */
import { useCallback } from 'react';
import useSWR from 'swr';
import { apiClient, swrFetcher } from '@/lib/api-client';
import type { PaginatedResponse } from '@echolife/shared';
import type { AppNotification } from '@echolife/shared';

const NOTIFICATIONS_KEY = '/notifications?pageSize=20';

export function useNotifications() {
  const { data, mutate, isLoading } = useSWR<PaginatedResponse<AppNotification>>(
    NOTIFICATIONS_KEY,
    swrFetcher,
    { revalidateOnFocus: false, refreshInterval: 60000 },
  );

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
      });
    },
    [mutate],
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
    });
  }, [mutate]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh: mutate,
  };
}
