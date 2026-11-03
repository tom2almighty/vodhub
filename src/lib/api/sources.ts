import { getDisabledSourceIds } from '@/lib/sourcePrefs';
import type { SearchResult } from '@/lib/types';
import { apiFetch, apiJson } from './client';

// ===== types =====

export type PlaySessionMode = 'direct' | 'group' | 'search';

export interface SourceOption {
  id: string;
  name: string;
  isEnabled: boolean;
}

export interface PlaySessionPayload {
  mode: PlaySessionMode;
  source?: string;
  id?: string;
  title?: string;
  year?: string;
  poster?: string;
  source_name?: string;
  type?: 'movie' | 'tv';
  query?: string;
  preferredSource?: string;
  preferredId?: string;
  candidates?: SearchResult[];
  keyword?: string;
  expectedTitle?: string;
  expectedYear?: string;
  excludedSources?: string[];
}

export interface PlaySessionResponse {
  detail: SearchResult;
  available_sources: SearchResult[];
  search_title: string;
  current_source: string;
  current_id: string;
  title: string;
  year: string;
  type: 'movie' | 'tv';
}

export interface SearchStreamCallbacks {
  onStart(totalSources: number): void;
  onResult(items: SearchResult[], sourceKey: string, sourceName: string): void;
  onProgress(completed: number, total: number): void;
  onComplete(totalResults: number, completedSources: number): void;
}

// ===== sources =====

export async function fetchSources(signal?: AbortSignal): Promise<SourceOption[]> {
  const data = await apiJson<{ items?: SourceOption[] }>('/api/sources', { signal });
  return data.items || [];
}

// ===== search =====

/** Exclusion list shared by every search entry point. */
function excludeQuery(): string {
  const disabled = getDisabledSourceIds();
  return disabled.size > 0 ? `&exclude=${encodeURIComponent([...disabled].join(','))}` : '';
}

export async function searchAllSources(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await apiJson<{ items?: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(trimmed)}${excludeQuery()}`,
    { signal },
  );
  return data.items || [];
}

async function searchWithJsonFallback(
  query: string,
  cb: SearchStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const data = await apiJson<{
    items?: SearchResult[];
    totalSources?: number;
    completedSources?: number;
  }>(`/api/search?q=${encodeURIComponent(query)}${excludeQuery()}`, { signal });
  const total = data.totalSources || 0;
  const completed = data.completedSources || total;
  cb.onStart(total);
  cb.onResult(data.items || [], '', '');
  cb.onProgress(completed, total);
  cb.onComplete((data.items || []).length, completed);
}

type StreamEvent = {
  type: 'start' | 'result' | 'progress' | 'complete' | 'error';
  totalSources?: number;
  items?: SearchResult[];
  sourceKey?: string;
  sourceName?: string;
  completed?: number;
  total?: number;
  totalResults?: number;
  completedSources?: number;
  message?: string;
};

export async function searchStream(
  query: string,
  cb: SearchStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  let resp: Response;
  try {
    resp = await apiFetch(`/api/search-stream?q=${encodeURIComponent(trimmed)}${excludeQuery()}`, {
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    throw err;
  }
  if (!resp.ok || !resp.body) {
    await searchWithJsonFallback(trimmed, cb, signal);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let resultCount = 0;
  let lastCompletedSources = 0;
  let streamError: Error | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return; // a malformed line must not abort an otherwise healthy stream
    }
    if (event.type === 'start') cb.onStart(event.totalSources || 0);
    else if (event.type === 'result') {
      resultCount += event.items?.length || 0;
      cb.onResult(event.items || [], event.sourceKey || '', event.sourceName || '');
    } else if (event.type === 'progress') {
      lastCompletedSources = event.completed || 0;
      cb.onProgress(event.completed || 0, event.total || 0);
    } else if (event.type === 'complete') {
      completed = true;
      if (event.completedSources != null) lastCompletedSources = event.completedSources;
      cb.onComplete(event.totalResults ?? resultCount, lastCompletedSources);
    } else if (event.type === 'error') {
      streamError = new Error(event.message || '搜索失败');
    }
  };

  try {
    while (!streamError) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
        if (streamError) break;
      }
    }

    if (streamError) {
      // Release the connection before surfacing the failure. Results already
      // delivered are kept — they are still valid.
      await reader.cancel().catch(() => undefined);
      throw streamError;
    }

    buffer += decoder.decode();
    if (buffer) handleLine(buffer);

    // A stream that ends without a `complete` event (proxy truncation, early
    // close) still has to finish the caller's state machine. Reporting 0/0 here
    // used to snap the progress UI back to zero, so report what we actually saw.
    if (!completed) cb.onComplete(resultCount, lastCompletedSources);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    throw err;
  }
}

// ===== detail + play session =====

export async function fetchSourceDetail(
  source: string,
  id: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  return apiJson<SearchResult>(
    `/api/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`,
    { signal },
  );
}

export async function createPlaySession(
  payload: PlaySessionPayload,
  signal?: AbortSignal,
): Promise<PlaySessionResponse> {
  const disabled = [...getDisabledSourceIds()];
  return apiJson<PlaySessionResponse>('/api/play-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Only `mode: 'search'` uses the exclusion list; direct/group playback of
    // an existing title stays available even if its source is toggled off.
    body: JSON.stringify(disabled.length ? { ...payload, excludedSources: disabled } : payload),
    signal,
  });
}
