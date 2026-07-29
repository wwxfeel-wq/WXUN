import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, isValid } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/** Merge Tailwind class names with conditional logic. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format an ISO date string into a human-readable absolute date. */
export function formatDate(
  date: string | Date | null | undefined,
  pattern: string = 'yyyy-MM-dd',
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '';
  return format(d, pattern, { locale: zhCN });
}

/** Format an ISO date string into a relative time (e.g. "3小时前"). */
export function formatRelativeTime(
  date: string | Date | null | undefined,
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
}

/** Format a date-time with time portion. */
export function formatDateTime(
  date: string | Date | null | undefined,
): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm');
}

/** Truncate text to a maximum length, appending a suffix. */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/** Convert a string into a URL-safe slug. */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Get initials from a nickname (first 1-2 characters). */
export function getInitials(name: string): string {
  if (!name) return '?';
  const trimmed = name.trim();
  // For CJK characters, take the first character; for Latin, take first letters of words
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed.slice(0, 1);
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Mapping from emotion string to a design-token CSS variable for UI accents. */
export const emotionColor: Record<string, string> = {
  joy: 'var(--color-apple-amber)',
  sadness: 'var(--color-indigo)',
  anger: 'var(--color-apple-red)',
  fear: 'var(--color-apple-gray)',
  surprise: 'var(--color-apple-green)',
  disgust: 'var(--color-apple-gray)',
  trust: 'var(--color-apple-blue)',
  anticipation: 'var(--color-apple-amber)',
  love: 'var(--color-apple-pink)',
  nostalgia: 'var(--color-apple-purple)',
  pride: 'var(--color-apple-yellow)',
  shame: 'var(--color-apple-dark-gray)',
  guilt: 'var(--color-apple-dark-gray)',
  envy: 'var(--color-apple-green)',
  hope: 'var(--color-apple-sky)',
  gratitude: 'var(--color-apple-blue)',
};

/** Resolve a color for an emotion string, falling back to a neutral tone. */
export function getEmotionColor(emotion?: string): string {
  if (!emotion) return 'var(--color-apple-gray)';
  return emotionColor[emotion.toLowerCase()] ?? 'var(--color-apple-gray)';
}

/** Emotion labels in Chinese. */
export const emotionLabels: Record<string, string> = {
  joy: '喜悦',
  sadness: '悲伤',
  anger: '愤怒',
  fear: '恐惧',
  surprise: '惊讶',
  disgust: '厌恶',
  trust: '信任',
  anticipation: '期待',
  love: '爱',
  nostalgia: '怀旧',
  pride: '骄傲',
  shame: '羞愧',
  guilt: '内疚',
  envy: '羡慕',
  hope: '希望',
  gratitude: '感恩',
};

/** Get the Chinese label for an emotion. */
export function getEmotionLabel(emotion?: string): string {
  if (!emotion) return '未知';
  return emotionLabels[emotion.toLowerCase()] ?? emotion;
}

/** Delay execution by a number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a number with thousands separators. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n);
}

/** Calculate the number of days until a target date. */
export function daysUntil(target: string | Date): number {
  const d = typeof target === 'string' ? new Date(target) : target;
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
