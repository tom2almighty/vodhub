/**
 * Fixed-window in-memory rate limiter.
 *
 * Best-effort by design: on edge runtimes counters live per-isolate, so a
 * determined attacker spread across colos gets a higher effective limit. It
 * still removes the trivial single-connection brute force against the single
 * shared admin password. Put a real rate limit at the CDN/WAF for hard
 * guarantees.
 */
const MAX_BUCKETS = 10000;

function prune(buckets, now) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map();

  function check(key) {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      if (buckets.size >= MAX_BUCKETS) prune(buckets, now);
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfter: 0 };
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  }

  /** Clears the counter for a key — used after a successful login. */
  function reset(key) {
    buckets.delete(key);
  }

  return { check, reset };
}

/**
 * Best-effort client IP. Every supported target (Vercel, Cloudflare, Netlify)
 * terminates TLS at its own edge and sets one of these headers; the socket
 * address is not available on edge runtimes.
 */
export function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-nf-client-connection-ip') ||
    'unknown'
  );
}
