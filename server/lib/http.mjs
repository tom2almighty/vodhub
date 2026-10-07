/**
 * Shared HTTP helpers.
 *
 * Everything here must run on edge runtimes (Cloudflare/Netlify) as well as
 * Node, so it sticks to Web-standard APIs only.
 */

const DEFAULT_TIMEOUT_MS = 10000;

export const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * An AbortSignal that fires after `timeoutMs`, chained to an optional upstream
 * signal (e.g. the client disconnecting). Callers MUST call `dispose()` when
 * done so the timer and listener are released.
 *
 * Kept as a signal factory rather than a fetch wrapper so the caller controls
 * how long the window stays open — a streamed body read can stay inside the
 * same timeout as the headers.
 */
export function createTimeoutSignal(timeoutMs = DEFAULT_TIMEOUT_MS, upstreamSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('请求上游超时')), timeoutMs);
  const forwardAbort = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal) {
    if (upstreamSignal.aborted) forwardAbort();
    else upstreamSignal.addEventListener('abort', forwardAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', forwardAbort);
    },
  };
}

/**
 * fetch() bounded by a timeout that covers the response headers only. Use
 * `createTimeoutSignal` directly when the body read must be covered too.
 */
export async function fetchWithTimeout(url, { headers, timeoutMs, signal, redirect } = {}) {
  const timeout = createTimeoutSignal(timeoutMs, signal);
  try {
    return await fetch(url, { headers, signal: timeout.signal, redirect });
  } finally {
    timeout.dispose();
  }
}

/**
 * Reads a response body into memory, aborting once `maxBytes` is exceeded.
 * Used by the image proxy so an upstream can't stream an unbounded body at us.
 */
export async function readCappedBody(response, maxBytes) {
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('响应体超过大小限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** True when `hostname` is `allowed` or a subdomain of it. */
export function hostMatches(hostname, allowed) {
  const host = String(hostname || '').toLowerCase();
  for (const candidate of allowed) {
    const base = String(candidate || '').toLowerCase();
    if (base && (host === base || host.endsWith(`.${base}`))) return true;
  }
  return false;
}

/**
 * Blocks IP literals that point at the local machine, a private network, or a
 * cloud metadata endpoint. Defence in depth behind the host allowlist.
 */
export function isBlockedHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  if (host.includes(':')) {
    // IPv6: loopback, link-local, unique-local, and IPv4-mapped addresses.
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe80') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:')
    );
  }

  const parts = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!parts) return false;

  const a = Number(parts[1]);
  const b = Number(parts[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}
