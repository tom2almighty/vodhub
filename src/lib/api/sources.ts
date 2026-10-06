import type { SearchResult } from '@/lib/types';
import { apiFetch, apiJson } from './client';

// ===== types =====

export type PlaySessionMode = 'direct' | 'group' | 'search';

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

// ===== search =====

export async function searchAllSources(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await apiJson<{ items?: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(trimmed)}`,
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
  }>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
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
    resp = await apiFetch(`/api/search-stream?q=${encodeURIComponent(trimmed)}`, { signal });
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

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === 'start') cb.onStart(event.totalSources || 0);
    else if (event.type === 'result')
      cb.onResult(event.items || [], event.sourceKey || '', event.sourceName || '');
    else if (event.type === 'progress') cb.onProgress(event.completed || 0, event.total || 0);
    else if (event.type === 'complete') {
      completed = true;
      cb.onComplete(event.totalResults || 0, event.completedSources || 0);
    } else if (event.type === 'error') {
      throw new Error(event.message || '搜索失败');
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) handleLine(line);
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);
    if (!completed) cb.onComplete(0, 0);
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
  return apiJson<PlaySessionResponse>('/api/play-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}
