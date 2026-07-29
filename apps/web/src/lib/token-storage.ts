/**
 * Token storage helpers.
 *
 * Tokens are persisted in localStorage so they survive page refreshes.
 * All access is guarded for SSR (window check) to remain Next.js safe.
 */

const ACCESS_TOKEN_KEY = 'echolife_access_token';
const REFRESH_TOKEN_KEY = 'echolife_refresh_token';

/** Read the access token from localStorage (browser only). */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Persist the access token to localStorage. */
export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** Read the refresh token from localStorage. */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Persist the refresh token to localStorage. */
export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/** Store both tokens at once. */
export function setTokens(accessToken: string, refreshToken: string): void {
  setToken(accessToken);
  setRefreshToken(refreshToken);
}

/** Remove both tokens from localStorage. */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
