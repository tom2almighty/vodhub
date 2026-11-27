import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAuthToken } from './auth';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function progressPct(current: number, total: number): number {
  if (!total || total <= 0) return 0;
  return clamp((current / total) * 100, 0, 100);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function stripDescriptionHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  if (originalUrl.includes('doubanio.com') || originalUrl.includes('douban.com')) {
    const token = getAuthToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `/api/image?url=${encodeURIComponent(originalUrl)}${tokenParam}`;
  }
  return originalUrl;
}

export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

export function parseStorageKey(key: string): { source: string; id: string } | null {
  const idx = key.indexOf('+');
  if (idx < 0) return null;
  return { source: key.slice(0, idx), id: key.slice(idx + 1) };
}
