import { createClient, mapDetail } from '../lib/cms.mjs';
import { findSource } from '../lib/sources.mjs';

export async function fetchDetail(env, sourceId, id) {
  const source = await findSource(env, sourceId);
  if (!source) return null;
  const cms = createClient(env);
  try {
    const result = await cms.getDetail(id, source);
    if (!result.success) return null;
    return mapDetail(result, source, id);
  } catch {
    return null;
  }
}

export async function detail(c) {
  const source = c.req.query('source') || '';
  const id = c.req.query('id') || '';
  if (!source || !id) return c.json({ error: '缺少 source 或 id' }, 400);
  const data = await fetchDetail(c.env, source, id);
  if (!data) return c.json({ error: '获取详情失败' }, 404);
  return c.json(data);
}
