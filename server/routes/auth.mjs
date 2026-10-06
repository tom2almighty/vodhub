import { createAuthToken, getAuthConfig, isAuthorized, passwordMatches } from '../lib/auth.mjs';

export async function login(c) {
  const env = c.env;
  const { adminPassword, authSecret } = getAuthConfig(env);
  if (!adminPassword || !authSecret) return c.json({ error: '认证未配置' }, 500);
  const payload = await c.req.json().catch(() => null);
  const password = String(payload?.password || '');
  if (!passwordMatches(password, adminPassword)) {
    return c.json({ error: '密码错误' }, 401);
  }
  return c.json({ token: await createAuthToken(env) });
}

export async function verify(c) {
  return (await isAuthorized(c.req.raw, c.env))
    ? c.json({ ok: true })
    : c.json({ error: '未登录或登录已过期' }, 401);
}
