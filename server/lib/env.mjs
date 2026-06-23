function processEnv() {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

function netlifyEnv(key) {
  try {
    const value = globalThis.Netlify?.env?.get?.(key);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function readEnv(env, ...keys) {
  for (const key of keys) {
    const value = env?.[key] ?? netlifyEnv(key) ?? processEnv()?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function readEnvInt(env, key, fallback) {
  const raw = readEnv(env, key);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
