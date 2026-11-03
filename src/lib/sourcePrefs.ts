const STORAGE_KEY = 'vodhub_source_prefs';
const EVENT = 'sourcePrefsUpdated';

/**
 * Source toggles are a per-browser preference, not server state. Only disabled
 * ids are stored so newly subscribed sources are enabled by default; ids that
 * disappear from the subscription stay in the list harmlessly and recover their
 * old state if the source comes back.
 */
function read(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Unparseable payload: drop it instead of reparsing garbage on every read.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    return new Set();
  }
}

/** @returns false when storage is blocked or the quota is full. */
function write(disabled: Set<string>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
    return true;
  } catch {
    return false;
  }
}

function dispatch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getDisabledSourceIds(): Set<string> {
  return read();
}

/** @returns false when the preference could not be persisted. */
export function setSourceEnabled(id: string, enabled: boolean): boolean {
  const disabled = read();
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  const stored = write(disabled);
  dispatch();
  return stored;
}

/** Applies the same state to a batch (same-all / none-all). */
export function setSourcesEnabled(ids: string[], enabled: boolean): boolean {
  const disabled = read();
  for (const id of ids) {
    if (enabled) disabled.delete(id);
    else disabled.add(id);
  }
  const stored = write(disabled);
  dispatch();
  return stored;
}

export function subscribeToSourcePrefs(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// The custom event above is same-document only; `storage` fires in the other
// tabs, so re-broadcast it to keep two tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    dispatch();
  });
}
