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

export async function verify(): Promise<boolean> {
  try {
    const resp = await apiFetch('/api/auth/verify');
    return resp.ok;
  } catch {
    return false;
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
