import { createAuthToken, getAuthConfig, isAuthorized, passwordMatches } from '../lib/auth.mjs';
import { clientIp, createRateLimiter } from '../lib/ratelimit.mjs';

const MAX_BODY_BYTES = 8 * 1024;

// Brute-force protection for the single shared admin password. Best-effort on
// edge runtimes (counters are per-isolate) — see ratelimit.mjs.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const loginLimiter = createRateLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });

export async function login(c) {
  const env = c.env;
  const { adminPassword, authSecret } = getAuthConfig(env);
  if (!adminPassword || !authSecret) return c.json({ error: '认证未配置' }, 500);

  const declaredLength = Number(c.req.header('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return c.json({ error: '请求体过大' }, 413);

  const ip = clientIp(c);
  const gate = loginLimiter.check(ip);
  if (!gate.ok) {
    return c.json({ error: '尝试次数过多，请稍后再试' }, 429, {
      'Retry-After': String(gate.retryAfter),
    });
  }

  const payload = await c.req.json().catch(() => null);
  const password = String(payload?.password || '');
  if (!passwordMatches(password, adminPassword)) {
    return c.json({ error: '密码错误' }, 401);
  }

  // A legitimate sign-in clears the counter so normal logins can't lock a user out.
  loginLimiter.reset(ip);
  return c.json({ token: await createAuthToken(env) });
}

export async function verify(c) {
  return (await isAuthorized(c.req.raw, c.env))
    ? c.json({ ok: true })
    : c.json({ error: '未登录或登录已过期' }, 401);
}
