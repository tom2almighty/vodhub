import { authFetch } from '@/lib/auth';

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return authFetch(input, init);
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const resp = await apiFetch(input, init);
  const data = (await resp.json().catch(() => null)) as { error?: string } | null;
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  // A 2xx with an empty or non-JSON body used to be cast to T and blow up as
  // "Cannot read properties of null" at the first property access.
  if (data === null) throw new Error('服务器返回了空响应');
  return data as T;
}
