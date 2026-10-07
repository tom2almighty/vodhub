import { readEnv, readEnvInt } from './env.mjs';
import { COMMON_UA, fetchWithTimeout, isHttpUrl } from './http.mjs';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FAILURE_RETRY_MS = 15 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

let cache = { sources: null, key: '', nextRetryAt: 0 };
let inflight = null;
let inflightKey = '';

export { isHttpUrl };

function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object' && s.id && s.url)
    .map((s) => ({
      id: String(s.id).trim(),
      name: String(s.name || s.id).trim(),
      url: String(s.url).trim(),
      detailUrl: s.detailUrl ? String(s.detailUrl).trim() : undefined,
      timeout: typeof s.timeout === 'number' && s.timeout > 0 ? s.timeout : undefined,
      retry: typeof s.retry === 'number' && s.retry >= 0 ? s.retry : undefined,
      isEnabled: s.isEnabled !== false,
    }))
    .filter((s) => s.id && s.url && isHttpUrl(s.url));
}

function parse(raw) {
  try {
    const cleaned = String(raw || '')
      .replace(/^\s*['"`]/, '')
      .replace(/['"`]\s*$/, '')
      .trim();
    const data = JSON.parse(cleaned);
    return normalize(Array.isArray(data) ? data : [data]);
  } catch {
    return [];
  }
}

async function fetchText(url, timeoutMs) {
  const resp = await fetchWithTimeout(url, {
    timeoutMs,
    headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': COMMON_UA },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

async function load(env, cacheKey) {
  const url = readEnv(env, 'SOURCES_URL');
  const inline = readEnv(env, 'SOURCES_JSON');
  const ttlMs = readEnvInt(env, 'SOURCES_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS);
  const retryMs = readEnvInt(env, 'SOURCES_RETRY_MS', DEFAULT_FAILURE_RETRY_MS);
  const timeoutMs = readEnvInt(env, 'SOURCES_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS);

  let sources = [];
  let failed = false;

  if (url && isHttpUrl(url)) {
    try {
      sources = parse(await fetchText(url, timeoutMs));
    } catch (err) {
      failed = true;
      console.error('SOURCES_URL load failed:', err);
    }
  }
  if (sources.length === 0 && inline) sources = parse(inline);

  if (failed && sources.length === 0) {
    // Never cache a transient failure for the full TTL — that would silently
    // disable search for every request in the window. Serve the last known-good
    // list if we have one, and retry after a short backoff instead.
    const fallback = cache.sources !== null && cache.key === cacheKey ? cache.sources : [];
    cache = { sources: fallback, key: cacheKey, nextRetryAt: Date.now() + retryMs };
    return fallback;
  }

  cache = { sources, key: cacheKey, nextRetryAt: Date.now() + ttlMs };
  return sources;
}

export async function loadSources(env) {
  const cacheKey = `${readEnv(env, 'SOURCES_URL')}\n${readEnv(env, 'SOURCES_JSON')}`;
  const now = Date.now();

  if (cache.sources !== null && cache.key === cacheKey && now < cache.nextRetryAt) {
    return cache.sources;
  }
  // Dedupe concurrent cold loads so a burst of requests makes one upstream call.
  if (inflight && inflightKey === cacheKey) return inflight;

  const task = load(env, cacheKey);
  inflight = task;
  inflightKey = cacheKey;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}

export async function findSource(env, id) {
  const sources = await loadSources(env);
  return sources.find((s) => s.id === id) || null;
}
