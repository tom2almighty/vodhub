import { readEnv } from './env.mjs';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

let cache = { sources: null, key: '', at: 0 };

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

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

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('request timeout'), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': COMMON_UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSources(env) {
  const url = readEnv(env, 'SOURCES_URL');
  const inline = readEnv(env, 'SOURCES_JSON');
  const cacheKey = `${url}\n${inline}`;
  const now = Date.now();
  if (cache.sources && cache.key === cacheKey && now - cache.at < CACHE_TTL_MS) {
    return cache.sources;
  }

  let sources = [];
  if (url && isHttpUrl(url)) {
    try {
      sources = parse(await fetchText(url));
    } catch (err) {
      console.error('SOURCES_URL load failed:', err);
    }
  }
  if (sources.length === 0 && inline) sources = parse(inline);

  cache = { sources, key: cacheKey, at: now };
  return sources;
}

export async function findSource(env, id) {
  const sources = await loadSources(env);
  return sources.find((s) => s.id === id) || null;
}
