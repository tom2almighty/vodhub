import type { DoubanCategoryResult, PlayRecord, RecommendationHomeResult } from './types';
import { generateStorageKey } from './utils';

const HISTORY_KEY = 'vodhub_play_records';
const SEARCH_KEY = 'vodhub_search_history';
const CACHE_KEY = 'vodhub_douban_cache';
const CACHE_VERSION = '2.0.0';
const PLAY_LIMIT = 200;
const SEARCH_LIMIT = 20;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LocalDataEvent = 'playRecordsUpdated' | 'searchHistoryUpdated';

function dispatch<T>(event: LocalDataEvent, detail: T): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

export function subscribeLocalData<T>(
  event: LocalDataEvent,
  callback: (data: T) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => callback((e as CustomEvent<T>).detail);
  window.addEventListener(event, handler);
  return () => window.removeEventListener(event, handler);
}

// ===== play records (browser-local, isolated per friend/device) =====

export function getAllPlayRecords(): Record<string, PlayRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, PlayRecord>)
      : {};
  } catch {
    return {};
  }
}

function writePlayRecords(records: Record<string, PlayRecord>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function savePlayRecord(source: string, id: string, record: PlayRecord): boolean {
  const records = getAllPlayRecords();
  records[generateStorageKey(source, id)] = record;
  const keys = Object.keys(records);
  let next = records;
  if (keys.length > PLAY_LIMIT) {
    const kept = keys
      .sort((a, b) => (records[b]?.save_time || 0) - (records[a]?.save_time || 0))
      .slice(0, PLAY_LIMIT);
    next = {};
    for (const k of kept) next[k] = records[k];
  }
  const ok = writePlayRecords(next);
  dispatch('playRecordsUpdated', next);
  return ok;
}

export function deletePlayRecord(source: string, id: string): boolean {
  const records = getAllPlayRecords();
  delete records[generateStorageKey(source, id)];
  const ok = writePlayRecords(records);
  dispatch('playRecordsUpdated', records);
  return ok;
}

export function clearAllPlayRecords(): boolean {
  const ok = writePlayRecords({});
  dispatch('playRecordsUpdated', {});
  return ok;
}

// ===== search history (browser-local) =====

export function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEARCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(items: string[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(SEARCH_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function addSearchHistory(keyword: string): string[] {
  const trimmed = keyword.trim();
  const cur = getSearchHistory();
  if (!trimmed) return cur;
  const next = [trimmed, ...cur.filter((k) => k !== trimmed)].slice(0, SEARCH_LIMIT);
  writeSearchHistory(next);
  dispatch('searchHistoryUpdated', next);
  return next;
}

export function deleteSearchHistory(keyword: string): string[] {
  const next = getSearchHistory().filter((k) => k !== keyword.trim());
  writeSearchHistory(next);
  dispatch('searchHistoryUpdated', next);
  return next;
}

export function clearSearchHistory(): string[] {
  writeSearchHistory([]);
  dispatch('searchHistoryUpdated', []);
  return [];
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === HISTORY_KEY) dispatch('playRecordsUpdated', getAllPlayRecords());
    if (e.key === SEARCH_KEY) dispatch('searchHistoryUpdated', getSearchHistory());
  });
}

// ===== Douban local cache =====

interface TimedEntry<T> {
  data: T;
  version: string;
  timestamp: number;
}

interface CacheStore {
  recommendations?: TimedEntry<RecommendationHomeResult>;
  doubanCategories?: Record<string, TimedEntry<DoubanCategoryResult>>;
}

function readCache(): CacheStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheStore) : {};
  } catch {
    return {};
  }
}

function writeCache(store: CacheStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function readTimed<T>(entry: TimedEntry<T> | undefined): T | null {
  if (!entry || entry.version !== CACHE_VERSION) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry.data;
}

export function getCachedRecommendations(): RecommendationHomeResult | null {
  const store = readCache();
  return readTimed(store.recommendations);
}

export function setCachedRecommendations(data: RecommendationHomeResult): void {
  const store = readCache();
  store.recommendations = { data, version: CACHE_VERSION, timestamp: Date.now() };
  writeCache(store);
}

export function getCachedDoubanCategory(key: string): DoubanCategoryResult | null {
  const store = readCache();
  return readTimed(store.doubanCategories?.[key]);
}

export function setCachedDoubanCategory(key: string, data: DoubanCategoryResult): void {
  const store = readCache();
  store.doubanCategories = {
    ...(store.doubanCategories || {}),
    [key]: { data, version: CACHE_VERSION, timestamp: Date.now() },
  };
  writeCache(store);
}
