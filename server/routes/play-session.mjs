import { normalizeYear } from '../lib/cms.mjs';
import { findSource } from '../lib/sources.mjs';
import { fetchDetail } from './detail.mjs';
import { aggregate } from './search.mjs';

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
    const filtered = list.filter((cand) => cand?.source && cand?.id);
    if (filtered.length === 0) throw new Error('缺少候选播放源');
    return filtered;
  }

  if (mode === 'direct') {
    const source = String(payload.source || '');
    const id = String(payload.id || '');
    if (!source || !id) throw new Error('缺少 source 或 id');
    const src = await findSource(env, source);
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
  const useChoice = preferredSource && preferredId;
  const currentSource = useChoice ? preferredSource : candidates[0].source;
  const currentId = useChoice ? preferredId : candidates[0].id;

  const chosen =
    candidates.find((cand) => cand.source === currentSource && cand.id === currentId) ||
    candidates[0];

  let detail;
  if (chosen.episodes?.length) {
    detail = chosen;
  } else {
    const fetched = await fetchDetail(env, currentSource, currentId);
    detail = fetched || chosen;
  }

  const title = String(payload.title || detail.title || candidates[0]?.title || '').trim();
  const year = normalizeYear(payload.year || detail.year);
  const type = detail.episodes?.length > 1 ? 'tv' : 'movie';

  return c.json({
    detail,
    available_sources: candidates,
    search_title: String(payload.query || ''),
    current_source: currentSource,
    current_id: currentId,
    title,
    year,
    type,
  });
}
