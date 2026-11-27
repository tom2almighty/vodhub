import {
  createCmsClient,
  createDirectStrategy,
  createFetchAdapter,
  parsePlayUrl,
} from '@ouonnki/cms-core';
import { readEnvInt } from './env.mjs';

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;

export function createClient(env) {
  const limit = readEnvInt(env, 'SEARCH_CONCURRENCY', DEFAULT_CONCURRENCY);
  return createCmsClient({
    requestAdapter: createFetchAdapter(),
    proxyStrategy: createDirectStrategy(),
    concurrencyLimit: Math.min(MAX_CONCURRENCY, Math.max(1, limit)),
  });
}

function normalizeYear(value) {
  return String(value || '').match(/\d{4}/)?.[0] || 'unknown';
}

/**
 * Map a raw cms VideoItem to our SearchResult shape AND parse vod_play_url
 * upfront so search results carry playable episode URLs.
 */
export function mapItem(item) {
  const parsed = parsePlayUrl(item.vod_play_url || '', item.vod_play_from || '');
  return {
    id: String(item.vod_id || ''),
    title: String(item.vod_name || ''),
    poster: String(item.vod_pic || ''),
    source: String(item.source_code || ''),
    source_name: String(item.source_name || ''),
    year: normalizeYear(item.vod_year),
    episodes: parsed.urls,
    episodes_titles: parsed.names,
    class: '',
    desc: String(item.vod_content || ''),
    type_name: String(item.type_name || ''),
    douban_id: item.vod_douban_id ? Number(item.vod_douban_id) : 0,
    score: item.vod_douban_score ? String(item.vod_douban_score) : '',
    actors: String(item.vod_actor || ''),
    directors: String(item.vod_director || ''),
    area: String(item.vod_area || ''),
    lang: '',
    remark: String(item.vod_remarks || ''),
  };
}

export function mapDetail(detail, source, id) {
  return {
    id,
    title: detail.videoInfo?.title || '',
    poster: detail.videoInfo?.cover || '',
    source: source.id,
    source_name: detail.videoInfo?.source_name || source.name,
    episodes: detail.episodes || [],
    episodes_titles: detail.videoInfo?.episodes_names || [],
    year: normalizeYear(detail.videoInfo?.year),
    desc: detail.videoInfo?.desc || '',
    type_name: detail.videoInfo?.type || '',
    area: detail.videoInfo?.area || '',
    actors: detail.videoInfo?.actor || '',
    directors: detail.videoInfo?.director || '',
    douban_id: 0,
    score: '',
    class: '',
    lang: '',
    remark: detail.videoInfo?.remarks || '',
  };
}

const STRIP_PUNCTUATION_RE = /[\s·•・:：\-—_,.，。!！?？'"“”‘’()（）[\]【】《》/\\]+/g;

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(STRIP_PUNCTUATION_RE, '');
}

/**
 * Scores how well a mapped SearchResult matches the user's query.
 * Returns 0 when unrelated — this filters out MacCMS sources that ignore `wd=`
 * and dump their default latest list on every search.
 */
export function scoreRelevance(item, query) {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(normalizedQuery);
  if (!compactQuery) return 0;

  const compactTitle = compactSearchText(item.title);
  if (compactTitle === compactQuery) return 100;
  if (compactTitle.startsWith(compactQuery)) return 80;
  if (compactTitle.includes(compactQuery)) return 60;

  const tokens = normalizedQuery
    .split(/\s+/)
    .map((token) => compactSearchText(token))
    .filter(Boolean);

  if (tokens.length > 1 && tokens.every((token) => compactTitle.includes(token))) {
    return 50;
  }

  const compactPeople = compactSearchText(`${item.actors || ''} ${item.directors || ''}`);
  if (compactQuery.length >= 2 && compactPeople.includes(compactQuery)) {
    return 30;
  }

  if (
    tokens.length > 1 &&
    tokens.every((token) => compactTitle.includes(token) || compactPeople.includes(token))
  ) {
    return 25;
  }

  return 0;
}

export function filterRelevantItems(items, query) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.filter((item) => scoreRelevance(item, query) > 0);
}

export function sortByRelevance(items, query) {
  if (!Array.isArray(items) || items.length <= 1) return items || [];
  return items
    .map((item, index) => ({ item, index, score: scoreRelevance(item, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export { normalizeYear };
