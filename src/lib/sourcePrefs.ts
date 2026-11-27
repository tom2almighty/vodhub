const STORAGE_KEY = 'vodhub_source_prefs';
const EVENT = 'sourcePrefsUpdated';

export type SourceOverrides = Record<string, boolean>;

/**
 * Per-browser overrides on top of the subscription's `isEnabled` defaults.
 * - missing key: follow the subscription's `isEnabled`
 * - `true`: manually enabled by the user (even if default-off in subscription)
 * - `false`: manually disabled by the user (even if default-on in subscription)
 */
function read(): SourceOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    const result: SourceOverrides = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean' && id) result[id] = value;
    }
    return result;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    return {};
  }
}

/** @returns false when storage is blocked or the quota is full. */
function write(overrides: SourceOverrides): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
    return true;
  } catch {
    return false;
  }
}

function dispatch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSourceOverrides(): SourceOverrides {
  return read();
}

export function getExcludedSourceIds(): string[] {
  const overrides = read();
  return Object.entries(overrides)
    .filter(([, enabled]) => !enabled)
    .map(([id]) => id);
}

export function getIncludedSourceIds(): string[] {
  const overrides = read();
  return Object.entries(overrides)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
}

export function isSourceActive(
  source: { id: string; isEnabled: boolean },
  overrides: SourceOverrides,
): boolean {
  return overrides[source.id] ?? source.isEnabled;
}

/** @returns false when the preference could not be persisted. */
export function setSourceOverride(id: string, enabled: boolean, defaultEnabled: boolean): boolean {
  const overrides = read();
  if (enabled === defaultEnabled) delete overrides[id];
  else overrides[id] = enabled;
  const stored = write(overrides);
  dispatch();
  return stored;
}

/** Applies the same state to a batch (enable-all / disable-all). */
export function setSourcesOverride(
  sources: Array<{ id: string; isEnabled: boolean }>,
  enabled: boolean,
): boolean {
  const overrides = read();
  for (const s of sources) {
    if (enabled === s.isEnabled) delete overrides[s.id];
    else overrides[s.id] = enabled;
  }
  const stored = write(overrides);
  dispatch();
  return stored;
}

export function resetSourceOverrides(): boolean {
  const stored = write({});
  dispatch();
  return stored;
}

export function subscribeToSourcePrefs(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// The custom event above is same-document only; `storage` fires in other tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    dispatch();
  });
}
