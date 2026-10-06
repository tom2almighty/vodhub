const TOKEN_KEY = 'vodhub_auth_token';
const PERSIST_FLAG = 'vodhub_auth_persist';

function safeStorage(persistent: boolean): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return persistent ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string, persist: boolean): void {
  const store = safeStorage(persist);
  if (!store) return;
  // Make sure the token doesn't end up in both stores.
  clearAuthToken();
  store.setItem(TOKEN_KEY, token);
  if (persist) {
    try {
      window.localStorage.setItem(PERSIST_FLAG, '1');
    } catch {
      /* ignore */
    }
  }
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PERSIST_FLAG);
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function wasPersisted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PERSIST_FLAG) === '1';
  } catch {
    return false;
  }
}

function authHeaders(headers: HeadersInit = {}): Headers {
  const merged = new Headers(headers);
  const token = getAuthToken();
  if (token) merged.set('Authorization', `Bearer ${token}`);
  return merged;
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: authHeaders(init.headers || {}),
  });
}
