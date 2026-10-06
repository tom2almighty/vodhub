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
  return data as T;
}
