import { authFetch } from './auth';
import { getExcludedSourceIds, getIncludedSourceIds } from './sourcePrefs';
import type {
  AdminSourcesPayload,
  DoubanCategories,
  DoubanCategoryResult,
  DoubanKind,
  PlaySessionPayload,
  PlaySessionResponse,
  ProbeInfo,
  RecommendationHomeResult,
  SearchResult,
  SiteConfig,
  SourceOption,
  UserRole,
  VideoSource,
} from './types';

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return authFetch(input, init);
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const resp = await apiFetch(input, init);
  const data = (await resp.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  if (!resp.ok) throw new Error(data?.message || data?.error || `HTTP ${resp.status}`);
  if (data === null) throw new Error('服务器返回了空响应');
  return data as T;
}

// ===== auth & site =====

export type VerifyResult =
  | { status: 'valid'; role: UserRole }
  | { status: 'invalid' }
  | { status: 'error' };

export async function login(password: string): Promise<{ token: string; role: UserRole } | null> {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await resp.json().catch(() => null)) as {
    token?: string;
    role?: UserRole;
    message?: string;
  } | null;
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error(data?.message || `登录接口异常：HTTP ${resp.status}`);
  if (!data?.token) return null;
  return { token: data.token, role: data.role === 'admin' ? 'admin' : 'viewer' };
}

export async function verify(): Promise<VerifyResult> {
  try {
    const resp = await apiFetch('/api/auth/verify');
    if (resp.ok) {
      const data = (await resp.json().catch(() => null)) as { role?: UserRole } | null;
      return { status: 'valid', role: data?.role === 'admin' ? 'admin' : 'viewer' };
    }
    return resp.status === 401 || resp.status === 403 ? { status: 'invalid' } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const data = await apiJson<Partial<SiteConfig>>('/api/site-config');
    return {
      siteName: data?.siteName || 'vodhub',
      announcement: data?.announcement || '',
      announcementTitle: data?.announcementTitle || '',
    };
  } catch {
    return { siteName: 'vodhub', announcement: '', announcementTitle: '' };
  }
}

// ===== sources (viewer quick list + admin management) =====

export async function fetchSources(signal?: AbortSignal): Promise<SourceOption[]> {
  const data = await apiJson<{ items?: SourceOption[] }>('/api/sources', { signal });
  return data.items || [];
}

export async function fetchAdminSources(signal?: AbortSignal): Promise<AdminSourcesPayload> {
  return apiJson<AdminSourcesPayload>('/api/admin/sources', { signal });
}

export async function saveAdminSources(
  sources: VideoSource[],
  customUpstreamUrl?: string,
): Promise<AdminSourcesPayload> {
  return apiJson<AdminSourcesPayload>('/api/admin/sources', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources, customUpstreamUrl }),
  });
}

export async function syncAdminSources(payload: {
  preset?: string;
  url?: string;
  mode: 'merge' | 'append' | 'replace';
}): Promise<AdminSourcesPayload & { added: number; updated: number }> {
  return apiJson('/api/admin/sources/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function importAdminSources(
  payload: unknown,
  mode: 'merge' | 'append' | 'replace' = 'merge',
): Promise<{ sources: VideoSource[]; added: number; updated: number }> {
  return apiJson('/api/admin/sources/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, mode }),
  });
}

export async function probeAdminSource(source: VideoSource): Promise<ProbeInfo> {
  const data = await apiJson<{ probe: ProbeInfo }>('/api/admin/sources/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  return data.probe;
}

// ===== search & playback =====

export interface SearchStreamCallbacks {
  onStart(totalSources: number): void;
  onResult(items: SearchResult[], sourceKey: string, sourceName: string): void;
  onProgress(completed: number, total: number): void;
  onComplete(totalResults: number, completedSources: number): void;
}

function sourceOverrideQuery(): string {
  const excluded = getExcludedSourceIds();
  const included = getIncludedSourceIds();
  let params = '';
  if (excluded.length > 0) params += `&exclude=${encodeURIComponent(excluded.join(','))}`;
  if (included.length > 0) params += `&include=${encodeURIComponent(included.join(','))}`;
  return params;
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
  }>(`/api/search?q=${encodeURIComponent(query)}${sourceOverrideQuery()}`, { signal });
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
    resp = await apiFetch(
      `/api/search-stream?q=${encodeURIComponent(trimmed)}${sourceOverrideQuery()}`,
      { signal },
    );
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
      return;
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
      await reader.cancel().catch(() => undefined);
      throw streamError;
    }

    buffer += decoder.decode();
    if (buffer) handleLine(buffer);
    if (!completed) cb.onComplete(resultCount, lastCompletedSources);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    throw err;
  }
}

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
  const excluded = getExcludedSourceIds();
  const included = getIncludedSourceIds();
  const body: PlaySessionPayload = { ...payload };
  if (excluded.length) body.excludedSources = excluded;
  if (included.length) body.includedSources = included;
  return apiJson<PlaySessionResponse>('/api/play-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

// ===== douban =====

export interface DoubanCategoryParams {
  kind: DoubanKind;
  type: string;
  start?: number;
  limit?: number;
}

export function getDoubanCategoryCacheKey(params: DoubanCategoryParams): string {
  return [params.kind, params.type, String(params.start ?? 0), String(params.limit ?? 18)].join(
    '|',
  );
}

export async function fetchDoubanCategory(
  params: DoubanCategoryParams,
  signal?: AbortSignal,
): Promise<DoubanCategoryResult> {
  const search = new URLSearchParams({
    kind: params.kind,
    type: params.type,
    start: String(params.start ?? 0),
    limit: String(params.limit ?? 18),
  });
  return apiJson<DoubanCategoryResult>(`/api/douban/category?${search.toString()}`, { signal });
}

export async function fetchDoubanCategories(signal?: AbortSignal): Promise<DoubanCategories> {
  return apiJson<DoubanCategories>('/api/douban/categories', { signal });
}

export async function fetchRecommendations(
  signal?: AbortSignal,
): Promise<RecommendationHomeResult> {
  return apiJson<RecommendationHomeResult>('/api/recommendations', { signal });
}
