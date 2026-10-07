import { normalizeYear } from '../lib/cms.mjs';
import { findSource, loadSources } from '../lib/sources.mjs';
import { fetchDetailResult } from './detail.mjs';
import { aggregate } from './search.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CANDIDATES = 50;

function emptyResult(overrides = {}) {
  return {
    id: '',
    title: '',
    poster: '',
    source: '',
    source_name: '',
    episodes: [],
    episodes_titles: [],
    year: 'unknown',
    desc: '',
    type_name: '',
    area: '',
    actors: '',
    directors: '',
    douban_id: 0,
    score: '',
    class: '',
    lang: '',
    remark: '',
    ...overrides,
  };
}

async function resolveCandidates(payload, env) {
  const mode = String(payload?.mode || '');

  if (mode === 'group') {
    const list = Array.isArray(payload.candidates) ? payload.candidates : [];
    // Disabled sources must not be reachable through the client-supplied list.
    const enabled = new Set((await loadSources(env)).filter((s) => s.isEnabled).map((s) => s.id));
    const filtered = list
      .slice(0, MAX_CANDIDATES)
      .filter((cand) => cand?.source && cand?.id && enabled.has(String(cand.source)))
      .map((cand) => ({ ...cand, source: String(cand.source), id: String(cand.id) }));
    if (filtered.length === 0) throw new Error('缺少候选播放源');
    return filtered;
  }

  if (mode === 'direct') {
    const source = String(payload.source || '');
    const id = String(payload.id || '');
    if (!source || !id) throw new Error('缺少 source 或 id');
    const src = await findSource(env, source);
    if (src && !src.isEnabled) throw new Error('播放源已停用');
    return [
      emptyResult({
        id,
        title: String(payload.title || ''),
        poster: String(payload.poster || ''),
        source,
        source_name: String(payload.source_name || src?.name || source),
        year: normalizeYear(payload.year),
      }),
    ];
  }

  if (mode === 'search') {
    const keyword = String(payload.keyword || '').trim();
    if (!keyword) throw new Error('缺少搜索关键词');
    const { items } = await aggregate(keyword, env);
    if (items.length === 0) throw new Error('未找到匹配播放源');
    return items;
  }

  throw new Error('无效的模式');
}

export async function playSession(c) {
  const env = c.env;

  const declaredLength = Number(c.req.header('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return c.json({ error: '请求体过大' }, 413);

  const payload = await c.req.json().catch(() => null);
  if (!payload) return c.json({ error: '请求体格式无效' }, 400);

  let candidates;
  try {
    candidates = await resolveCandidates(payload, env);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '加载播放源失败' }, 400);
  }

  const preferredSource = payload.preferredSource ? String(payload.preferredSource) : '';
  const preferredId = payload.preferredId ? String(payload.preferredId) : '';

  // Only honour the client's choice when it is actually among the candidates.
  // Previously current_source/current_id were set from the requested pair even
  // when it wasn't found, so they could describe a different source than the
  // `detail` that was returned.
  const preferred = candidates.find(
    (cand) => cand.source === preferredSource && cand.id === preferredId,
  );
  const chosen = preferred || candidates[0];

  let detail;
  if (chosen.episodes?.length) {
    detail = chosen;
  } else {
    const { status, data } = await fetchDetailResult(env, chosen.source, chosen.id);
    if (status === 'error') return c.json({ error: '播放源暂时不可用，请稍后重试' }, 502);
    detail = data || chosen;
  }

  const title = String(payload.title || detail.title || candidates[0]?.title || '').trim();
  const year = normalizeYear(payload.year || detail.year);
  const type = detail.episodes?.length > 1 ? 'tv' : 'movie';

  return c.json({
    detail,
    available_sources: candidates,
    search_title: String(payload.query || ''),
    current_source: chosen.source,
    current_id: chosen.id,
    title,
    year,
    type,
  });
}
