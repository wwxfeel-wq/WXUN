/**
 * Auth store (Zustand)
 *
 * Holds the authenticated user and access token. The token is mirrored to
 * localStorage so the API client can read it on the next page load, and the
 * user object is persisted alongside for instant UI hydration.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';
import {
  setTokens,
  clearTokens,
  getToken,
} from '@/lib/token-storage';
import type { AuthUser, AuthResponse } from '@/lib/types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;

  /** Log in with email + password. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Register a new account. */
  register: (email: string, password: string, nickname: string) => Promise<AuthUser>;
  /** Log out the current user. */
  logout: () => Promise<void>;
  /** Refresh the current user object from the server. */
  fetchUser: () => Promise<AuthUser>;
  /** Patch the locally-cached user object (e.g. after profile updates). */
  updateUser: (patch: Partial<AuthUser>) => void;
  /** Mark the store as hydrated (after rehydration from storage). */
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hydrated: false,

      login: async (email, password) => {
        const res = await apiClient.post<AuthResponse>('/auth/login', { email, password });
        setTokens(res.accessToken, res.refreshToken);
        set({
          user: res.user,
          accessToken: res.accessToken,
          isAuthenticated: true,
        });
        return res.user;
      },

      register: async (email, password, nickname) => {
        const res = await apiClient.post<AuthResponse>('/auth/register', {
          email,
          password,
          nickname,
        });
        setTokens(res.accessToken, res.refreshToken);
        set({
          user: res.user,
          accessToken: res.accessToken,
          isAuthenticated: true,
        });
        return res.user;
      },

      logout: async () => {
        try {
          await apiClient.post('/auth/logout');
        } catch {
          // Ignore errors on logout; clear local state regardless.
        }
        clearTokens();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      fetchUser: async () => {
        const user = await apiClient.get<AuthUser>('/auth/me');
        set({ user, isAuthenticated: true });
        return user;
      },

      updateUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } });
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'echolife-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, sync the token into the dedicated token storage
        // so the api client can read it, then mark as hydrated.
        if (state?.accessToken) {
          setTokens(state.accessToken, getRefreshTokenSync());
        }
        state?.setHydrated();
      },
    },
  ),
);

/** Synchronously read the refresh token (used during rehydration). */
function getRefreshTokenSync(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('echolife_refresh_token') ?? '';
}

/**
 * Initialize auth from storage on the client.
 * Called once from the ThemeProvider / app shell to ensure the token is
 * available to the API client before the first request.
 */
export function initAuth(): void {
  if (typeof window === 'undefined') return;
  const token = getToken();
  if (token) {
    // Ensure store reflects the persisted token state.
    const state = useAuthStore.getState();
    if (!state.accessToken) {
      useAuthStore.setState({ accessToken: token, isAuthenticated: !!state.user });
    }
  }
  useAuthStore.getState().setHydrated();
}
