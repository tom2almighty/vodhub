import type { DoubanCategoryResult } from './api/douban';
import type { PlayRecord, RecommendationHomeResult } from './types';

const STORAGE_KEY = 'vodhub_cache';
const CACHE_VERSION = '5.0.0';
const SEARCH_HISTORY_LIMIT = 20;
const REC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DOUBAN_CATEGORY_TTL_MS = REC_TTL_MS;

interface Entry<T> {
  data: T;
  version: string;
}

interface Store {
  playRecords?: Entry<Record<string, PlayRecord>>;
  searchHistory?: Entry<string[]>;
  recommendations?: { data: RecommendationHomeResult; timestamp: number };
  doubanCategories?: Record<string, { data: DoubanCategoryResult; timestamp: number }>;
}

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function getVersioned<T>(field: 'playRecords' | 'searchHistory'): T | null {
  const store = read();
  const entry = store[field] as Entry<T> | undefined;
  if (!entry) return null;
  if (entry.version !== CACHE_VERSION) {
    delete store[field];
    write(store);
    return null;
  }
  return entry.data;
}

function setVersioned<T>(field: 'playRecords' | 'searchHistory', data: T): void {
  const store = read();
  (store as Record<string, Entry<unknown>>)[field] = { data, version: CACHE_VERSION };
  write(store);
}

// ===== keys =====

export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

export function parseStorageKey(key: string): { source: string; id: string } | null {
  const idx = key.indexOf('+');
  if (idx < 0) return null;
  return { source: key.slice(0, idx), id: key.slice(idx + 1) };
}

// ===== events =====

export type DbEvent = 'playRecordsUpdated' | 'searchHistoryUpdated';

export function subscribeToDataUpdates<T>(event: DbEvent, callback: (data: T) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => callback((e as CustomEvent<T>).detail);
  window.addEventListener(event, handler);
  return () => window.removeEventListener(event, handler);
}

function dispatch<T>(event: DbEvent, detail: T): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

// ===== play records =====

export async function getAllPlayRecords(): Promise<Record<string, PlayRecord>> {
  return getVersioned<Record<string, PlayRecord>>('playRecords') || {};
}

export async function savePlayRecord(
  source: string,
  id: string,
  record: PlayRecord,
): Promise<void> {
  const records = (await getAllPlayRecords()) || {};
  records[generateStorageKey(source, id)] = record;
  setVersioned('playRecords', records);
  dispatch('playRecordsUpdated', records);
}

export async function deletePlayRecord(source: string, id: string): Promise<void> {
  const records = await getAllPlayRecords();
  delete records[generateStorageKey(source, id)];
  setVersioned('playRecords', records);
  dispatch('playRecordsUpdated', records);
}

export async function clearAllPlayRecords(): Promise<void> {
  setVersioned('playRecords', {});
  dispatch('playRecordsUpdated', {});
}

// ===== search history =====

export async function getSearchHistory(): Promise<string[]> {
  return getVersioned<string[]>('searchHistory') || [];
}

export async function addSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const history = await getSearchHistory();
  const next = [trimmed, ...history.filter((k) => k !== trimmed)].slice(0, SEARCH_HISTORY_LIMIT);
  setVersioned('searchHistory', next);
  dispatch('searchHistoryUpdated', next);
}

export async function deleteSearchHistory(keyword: string): Promise<void> {
  const history = await getSearchHistory();
  const next = history.filter((k) => k !== keyword.trim());
  setVersioned('searchHistory', next);
  dispatch('searchHistoryUpdated', next);
}

export async function clearSearchHistory(): Promise<void> {
  setVersioned('searchHistory', []);
  dispatch('searchHistoryUpdated', []);
}

// ===== recommendations cache =====

export function getCachedRecommendations(): RecommendationHomeResult | null {
  const store = read();
  const entry = store.recommendations;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > REC_TTL_MS) {
    delete store.recommendations;
    write(store);
    return null;
  }
  return entry.data;
}

export function setCachedRecommendations(data: RecommendationHomeResult): void {
  const store = read();
  store.recommendations = { data, timestamp: Date.now() };
  write(store);
}

// ===== Douban category cache =====

export function getCachedDoubanCategory(key: string): DoubanCategoryResult | null {
  const store = read();
  const entry = store.doubanCategories?.[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DOUBAN_CATEGORY_TTL_MS) {
    if (store.doubanCategories) {
      delete store.doubanCategories[key];
      write(store);
    }
    return null;
  }
  return entry.data;
}

export function setCachedDoubanCategory(key: string, data: DoubanCategoryResult): void {
  const store = read();
  store.doubanCategories = {
    ...(store.doubanCategories || {}),
    [key]: { data, timestamp: Date.now() },
  };
  write(store);
}
