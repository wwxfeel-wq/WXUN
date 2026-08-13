/**
 * EchoLife Analytics Tracker
 *
 * 轻量级埋点 SDK，自动采集页面浏览事件，支持自定义事件上报。
 * - 页面切换自动上报 page_view
 * - 使用 navigator.sendBeacon 或 fetch 上报
 * - sessionId 持久化到 localStorage，30 分钟过期
 * - 无身份认证要求（公开端点）
 */
import { API_PREFIX } from '@echolife/shared';

const TRACKING_ENDPOINT = `${API_PREFIX}/tracking/events`;
const SESSION_KEY = 'echolife-track-sid';
const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes

interface TrackPayload {
  sessionId: string;
  eventType: string;
  pagePath: string;
  pageTitle?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
}

/** Generate or retrieve a session ID from localStorage. */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const { sid, ts } = JSON.parse(stored) as { sid: string; ts: number };
      if (Date.now() - ts < SESSION_MAX_AGE) {
        // Refresh timestamp
        localStorage.setItem(SESSION_KEY, JSON.stringify({ sid, ts: Date.now() }));
        return sid;
      }
    }
    // Create new session
    const sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sid, ts: Date.now() }));
    return sid;
  } catch {
    return `s_${Date.now()}`;
  }
}

/** Send tracking data via sendBeacon (preferred) or fetch fallback. */
function send(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify(payload);

  // Use sendBeacon for reliability during page unload
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon(TRACKING_ENDPOINT, blob);
    if (ok) return;
  }

  // Fallback to fetch with keepalive
  try {
    fetch(TRACKING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* Silently fail — tracking is non-critical */
    });
  } catch {
    /* noop */
  }
}

/** Track a page view. */
export function trackPageView(path?: string, title?: string): void {
  const pagePath = path ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const pageTitle = title ?? (typeof document !== 'undefined' ? document.title : undefined);
  const referrer = typeof document !== 'undefined' ? document.referrer || undefined : undefined;

  send({
    sessionId: getSessionId(),
    eventType: 'page_view',
    pagePath,
    pageTitle,
    referrer,
  });
}

/** Track a custom event. */
export function trackEvent(
  eventType: string,
  pagePath?: string,
  metadata?: Record<string, unknown>,
): void {
  send({
    sessionId: getSessionId(),
    eventType,
    pagePath: pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
    metadata,
  });
}

/**
 * Initialize automatic page view tracking for Next.js App Router.
 * Call this once in a client component (e.g., AppShell).
 * Uses pathname from next/navigation.
 */
export function initAutoTracking(pathname: string): void {
  trackPageView(pathname);

  // Also track on visibility change (user returning to tab)
  if (typeof document !== 'undefined') {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        trackPageView(window.location.pathname, document.title);
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
  }
}
