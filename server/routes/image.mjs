import { readEnv } from '../lib/env.mjs';
import {
  COMMON_UA,
  createTimeoutSignal,
  hostMatches,
  isBlockedHost,
  isHttpUrl,
  readCappedBody,
} from '../lib/http.mjs';

// Only these hosts may be proxied. Douban is the sole upstream the client
// routes through here (see src/lib/utils/image.ts); extra hosts can be added
// via IMAGE_PROXY_ALLOWED_HOSTS without a code change.
const DEFAULT_ALLOWED_HOSTS = ['doubanio.com', 'douban.com'];
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 8 * 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=15552000, s-maxage=15552000, immutable';
// Explicit allowlist: never reflect Set-Cookie, Location, CSP, or any other
// origin header through the proxy.
const FORWARDED_HEADERS = ['content-type', 'etag', 'last-modified'];

function allowedHosts(env) {
  const hosts = [...DEFAULT_ALLOWED_HOSTS];
  const extra = readEnv(env, 'IMAGE_PROXY_ALLOWED_HOSTS');
  if (extra) {
    for (const entry of extra.split(',')) {
      const host = entry.trim().toLowerCase();
      if (host) hosts.push(host);
    }
  }
  return hosts;
}

export async function imageProxy(c) {
  const target = c.req.query('url') || '';
  if (!target || !isHttpUrl(target)) return c.body(null, 400);

  const hosts = allowedHosts(c.env);
  const targetUrl = new URL(target);
  if (!hostMatches(targetUrl.hostname, hosts) || isBlockedHost(targetUrl.hostname)) {
    return c.body(null, 403);
  }

  // The timeout spans the body read as well as the headers, so a slow trickle
  // can't hold the connection open indefinitely.
  const timeout = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const referer = hostMatches(targetUrl.hostname, ['doubanio.com', 'douban.com'])
      ? 'https://movie.douban.com/'
      : targetUrl.origin;

    const resp = await fetch(targetUrl, {
      signal: timeout.signal,
      redirect: 'follow',
      headers: { Referer: referer, 'User-Agent': COMMON_UA },
    });

    // A redirect chain can land outside the allowlist, so re-check the URL we
    // actually ended up on rather than the one we asked for.
    const finalUrl = new URL(resp.url || targetUrl.href);
    if (!hostMatches(finalUrl.hostname, hosts) || isBlockedHost(finalUrl.hostname)) {
      return c.body(null, 403);
    }

    if (!resp.ok) return c.body(null, resp.status === 404 ? 404 : 502);

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return c.body(null, 415);

    const declaredLength = Number(resp.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) return c.body(null, 413);

    const body = await readCappedBody(resp, MAX_BYTES);

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = resp.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('Cache-Control', CACHE_CONTROL);
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(body, { status: 200, headers });
  } catch {
    return c.body(null, 502);
  } finally {
    timeout.dispose();
  }
}
