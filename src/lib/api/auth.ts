import { apiFetch, apiJson } from './client';

export interface SiteConfig {
  siteName: string;
  announcement?: string;
  announcementTitle?: string;
}

export async function login(password: string): Promise<string | null> {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await resp.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (resp.status === 401) return null;
  if (!resp.ok) {
    throw new Error(data?.error || `登录接口异常：HTTP ${resp.status}`);
  }
  return data?.token || null;
}

/**
 * Result of a token check. `error` means the server could not be reached or
 * answered unexpectedly — it must NOT be treated as "the token is bad", or a
 * network blip signs the user out.
 */
export type VerifyResult = 'valid' | 'invalid' | 'error';

export async function verify(): Promise<VerifyResult> {
  try {
    const resp = await apiFetch('/api/auth/verify');
    if (resp.ok) return 'valid';
    return resp.status === 401 || resp.status === 403 ? 'invalid' : 'error';
  } catch {
    return 'error';
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
