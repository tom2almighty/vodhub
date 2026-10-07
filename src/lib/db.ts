import type { DoubanCategoryResult } from './api/douban';
import type { PlayRecord, RecommendationHomeResult } from './types';

const STORAGE_KEY = 'vodhub_cache';
const CACHE_VERSION = '5.0.0';
const SEARCH_HISTORY_LIMIT = 20;
const PLAY_RECORDS_LIMIT = 200;
const REC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DOUBAN_CATEGORY_TTL_MS = REC_TTL_MS;

interface Entry<T> {
  data: T;
  version: string;
}

interface TimedEntry<T> extends Entry<T> {
  timestamp: number;
}

interface Store {
  playRecords?: Entry<Record<string, PlayRecord>>;
  searchHistory?: Entry<string[]>;
  recommendations?: TimedEntry<RecommendationHomeResult>;
  doubanCategories?: Record<string, TimedEntry<DoubanCategoryResult>>;
}

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // Unparseable payload: drop it instead of reparsing garbage on every read.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    return {};
  }
}

/**
 * Writes the whole store back.
 *
 * @returns false when the write was rejected — quota exceeded, or storage
 * blocked entirely. Callers that care about durability must check this;
 * swallowing it silently loses the user's watch progress.
 */
function write(store: Store): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
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

function setVersioned<T>(field: 'playRecords' | 'searchHistory', data: T): boolean {
  const store = read();
  (store as Record<string, Entry<unknown>>)[field] = { data, version: CACHE_VERSION };
  return write(store);
}

/** TTL + version check shared by the timestamped caches. */
function readTimed<T>(entry: TimedEntry<T> | undefined, ttlMs: number): T | null {
  if (!entry || entry.version !== CACHE_VERSION) return null;
  if (Date.now() - entry.timestamp > ttlMs) return null;
  return entry.data;
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

// The events above are same-document only, so without this a second tab would
// never notice history written by the first. `storage` fires in the *other*
// tabs, which is exactly the gap.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    dispatch('playRecordsUpdated', getVersioned<Record<string, PlayRecord>>('playRecords') || {});
    dispatch('searchHistoryUpdated', getVersioned<string[]>('searchHistory') || []);
  });
}

// ===== play records =====

/** Keeps the store bounded: play records grow with every title ever watched. */
function capPlayRecords(records: Record<string, PlayRecord>): Record<string, PlayRecord> {
  const keys = Object.keys(records);
  if (keys.length <= PLAY_RECORDS_LIMIT) return records;
  const kept = keys
    .sort((a, b) => (records[b]?.save_time || 0) - (records[a]?.save_time || 0))
    .slice(0, PLAY_RECORDS_LIMIT);
  const next: Record<string, PlayRecord> = {};
  for (const key of kept) next[key] = records[key];
  return next;
}

export async function getAllPlayRecords(): Promise<Record<string, PlayRecord>> {
  return getVersioned<Record<string, PlayRecord>>('playRecords') || {};
}

export async function savePlayRecord(
  source: string,
  id: string,
  record: PlayRecord,
): Promise<boolean> {
  const records = (await getAllPlayRecords()) || {};
  records[generateStorageKey(source, id)] = record;
  const capped = capPlayRecords(records);
  const stored = setVersioned('playRecords', capped);
  dispatch('playRecordsUpdated', capped);
  return stored;
}

export async function deletePlayRecord(source: string, id: string): Promise<boolean> {
  const records = await getAllPlayRecords();
  delete records[generateStorageKey(source, id)];
  const stored = setVersioned('playRecords', records);
  dispatch('playRecordsUpdated', records);
  return stored;
}

export async function clearAllPlayRecords(): Promise<boolean> {
  const stored = setVersioned('playRecords', {});
  dispatch('playRecordsUpdated', {});
  return stored;
}

// ===== search history =====

export async function getSearchHistory(): Promise<string[]> {
  return getVersioned<string[]>('searchHistory') || [];
}

export async function addSearchHistory(keyword: string): Promise<boolean> {
  const trimmed = keyword.trim();
  if (!trimmed) return true;
  const history = await getSearchHistory();
  const next = [trimmed, ...history.filter((k) => k !== trimmed)].slice(0, SEARCH_HISTORY_LIMIT);
  const stored = setVersioned('searchHistory', next);
  dispatch('searchHistoryUpdated', next);
  return stored;
}

export async function deleteSearchHistory(keyword: string): Promise<boolean> {
  const history = await getSearchHistory();
  const next = history.filter((k) => k !== keyword.trim());
  const stored = setVersioned('searchHistory', next);
  dispatch('searchHistoryUpdated', next);
  return stored;
}

export async function clearSearchHistory(): Promise<boolean> {
  const stored = setVersioned('searchHistory', []);
  dispatch('searchHistoryUpdated', []);
  return stored;
}

// ===== recommendations cache =====

export function getCachedRecommendations(): RecommendationHomeResult | null {
  const store = read();
  const entry = store.recommendations;
  const data = readTimed(entry, REC_TTL_MS);
  if (data) return data;
  if (entry) {
    delete store.recommendations;
    write(store);
  }
  return null;
}

export function setCachedRecommendations(data: RecommendationHomeResult): void {
  const store = read();
  store.recommendations = { data, version: CACHE_VERSION, timestamp: Date.now() };
  write(store);
}

// ===== Douban category cache =====

export function getCachedDoubanCategory(key: string): DoubanCategoryResult | null {
  const store = read();
  const entry = store.doubanCategories?.[key];
  const data = readTimed(entry, DOUBAN_CATEGORY_TTL_MS);
  if (data) return data;
  if (entry && store.doubanCategories) {
    delete store.doubanCategories[key];
    write(store);
  }
  return null;
}

export function setCachedDoubanCategory(key: string, data: DoubanCategoryResult): void {
  const store = read();
  store.doubanCategories = {
    ...(store.doubanCategories || {}),
    [key]: { data, version: CACHE_VERSION, timestamp: Date.now() },
  };
  write(store);
}
