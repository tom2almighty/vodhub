import { readEnv, readEnvInt } from './env.mjs';

const DEFAULT_TTL = 7 * 24 * 60 * 60;

function getConfig(env) {
  return {
    adminPassword: readEnv(env, 'ADMIN_PASSWORD'),
    authSecret: readEnv(env, 'AUTH_SECRET'),
    ttlSeconds: readEnvInt(env, 'AUTH_TOKEN_TTL', DEFAULT_TTL),
  };
}

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

export async function createAuthToken(env) {
  const { authSecret, ttlSeconds } = getConfig(env);
  if (!authSecret) throw new Error('AUTH_SECRET 未配置');
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({ sub: 'admin', iat: now, exp: now + ttlSeconds }));
  const sig = await hmacSign(body, authSecret);
  return `${body}.${sig}`;
}

async function verifyAuthToken(token, env) {
  const { authSecret } = getConfig(env);
  if (!authSecret || !token?.includes('.')) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = await hmacSign(body, authSecret);
  if (!constantTimeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(body));
    return payload?.sub === 'admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const matched = header.match(/^Bearer\s+(.+)$/i);
  if (matched?.[1]?.trim()) return matched[1].trim();
  try {
    return new URL(request.url).searchParams.get('token') || '';
  } catch {
    return '';
  }
}

export async function isAuthorized(request, env) {
  return verifyAuthToken(bearerToken(request), env);
}

export function getAuthConfig(env) {
  return getConfig(env);
}

export function passwordMatches(input, expected) {
  return constantTimeEqual(input, expected);
}
