import { createClient, mapDetail } from '../lib/cms.mjs';
import { findSource } from '../lib/sources.mjs';

/**
 * Resolves a detail payload, distinguishing "this source doesn't have the id"
 * from "the upstream call failed" — the route needs to answer 404 for the
 * former and 502 for the latter.
 *
 * @returns {Promise<{ status: 'ok' | 'not-found' | 'error', data: object | null }>}
 */
export async function fetchDetailResult(env, sourceId, id) {
  const source = await findSource(env, sourceId);
  if (!source?.isEnabled) return { status: 'not-found', data: null };

  const cms = createClient(env);
  try {
    const result = await cms.getDetail(id, source);
    if (!result?.success) return { status: 'not-found', data: null };
    return { status: 'ok', data: mapDetail(result, source, id) };
  } catch (err) {
    console.error('detail upstream failed:', err);
    return { status: 'error', data: null };
  }
}

/** Convenience wrapper: the mapped detail, or null on any failure. */
export async function fetchDetail(env, sourceId, id) {
  const { data } = await fetchDetailResult(env, sourceId, id);
  return data;
}

export async function detail(c) {
  const source = c.req.query('source') || '';
  const id = c.req.query('id') || '';
  if (!source || !id) return c.json({ error: '缺少 source 或 id' }, 400);

  const { status, data } = await fetchDetailResult(c.env, source, id);
  if (status === 'error') return c.json({ error: '播放源暂时不可用，请稍后重试' }, 502);
  if (status === 'not-found' || !data) return c.json({ error: '获取详情失败' }, 404);
  return c.json(data);
}
