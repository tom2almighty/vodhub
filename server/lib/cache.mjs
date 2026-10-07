/**
 * A small bounded in-memory cache with TTL, LRU eviction and in-flight dedup.
 *
 * On edge runtimes the store is per-isolate, so a miss just costs an extra
 * upstream fetch — never incorrect behaviour. The bound matters on long-lived
 * Node/Docker processes, where an unbounded map keyed by request parameters is
 * a memory-growth (and denial-of-service) vector.
 */
export function createCache({ maxEntries = 500 } = {}) {
  const entries = new Map();
  const inflight = new Map();

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      entries.delete(key);
      return undefined;
    }
    // Re-insert so Map iteration order tracks recency.
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs) {
    if (entries.size >= maxEntries && !entries.has(key)) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Returns the cached value, or runs `producer` — at most once even when many
   * callers race for the same cold key (thundering-herd protection).
   */
  function resolve(key, ttlMs, producer) {
    const hit = get(key);
    if (hit !== undefined) return Promise.resolve(hit);

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await producer();
        set(key, value, ttlMs);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  return { get, set, resolve };
}
