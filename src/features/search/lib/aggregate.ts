import type { SearchResult } from '@/lib/types';

export interface SearchDisplayItem {
  key: string;
  title: string;
  poster: string;
  year: string;
  type: 'movie' | 'tv';
  douban_id: number;
  primary: SearchResult;
  /** All same-title sources available for playback switching. */
  candidates: SearchResult[];
  /** Present only in aggregated mode to show the multi-source badge. */
  sourceNames?: string[];
}

const STRIP_PUNCTUATION_RE = /[\s·•・:：\-—_,.，。!！?？'"“”‘’()（）[\]【】《》/\\]+/g;

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(STRIP_PUNCTUATION_RE, '');
}

function scoreTitleRelevance(item: SearchResult, query: string): number {
  const normalizedQuery = normalizeText(query);
  const compactQuery = compactText(normalizedQuery);
  if (!compactQuery) return 0;

  const compactTitle = compactText(item.title);
  if (compactTitle === compactQuery) return 100;
  if (compactTitle.startsWith(compactQuery)) return 80;
  if (compactTitle.includes(compactQuery)) return 60;

  const tokens = normalizedQuery
    .split(/\s+/)
    .map((t) => compactText(t))
    .filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => compactTitle.includes(t))) return 50;

  const compactPeople = compactText(`${item.actors || ''} ${item.directors || ''}`);
  if (compactQuery.length >= 2 && compactPeople.includes(compactQuery)) return 30;
  if (
    tokens.length > 1 &&
    tokens.every((t) => compactTitle.includes(t) || compactPeople.includes(t))
  ) {
    return 25;
  }
  return 0;
}

function buildGroupKey(item: SearchResult): string {
  const titleKey = item.title.trim().toLowerCase();
  const yearKey = item.year && item.year !== 'unknown' ? item.year : '';
  return `${titleKey}|${yearKey}`;
}

function groupByTitle(items: SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();
  for (const item of items) {
    const key = buildGroupKey(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function aggregateResults(items: SearchResult[], query = ''): SearchDisplayItem[] {
  const groups = groupByTitle(items);
  const result: Array<{ entry: SearchDisplayItem; score: number; order: number }> = [];
  let order = 0;

  for (const [key, group] of groups) {
    const primary = group[0];
    const poster = group.find((g) => g.poster)?.poster || '';
    const entry: SearchDisplayItem = {
      key,
      title: primary.title,
      poster,
      year: primary.year,
      type: primary.episodes && primary.episodes.length === 1 ? 'movie' : 'tv',
      douban_id: primary.douban_id || 0,
      primary,
      candidates: group,
      sourceNames: group.map((g) => g.source_name),
    };
    result.push({ entry, score: scoreTitleRelevance(primary, query), order: order++ });
  }

  if (query.trim()) {
    result.sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.candidates.length - a.entry.candidates.length ||
        a.order - b.order,
    );
  }
  return result.map((r) => r.entry);
}

/**
 * Unaggregated display: each search hit gets its own card showing its single
 * source, while still attaching all same-title hits as `candidates` so the
 * player starts on the clicked source and allows switching between peers.
 */
export function flattenResults(items: SearchResult[], query = ''): SearchDisplayItem[] {
  const groups = groupByTitle(items);
  const seenKeys = new Map<string, number>();

  const result = items.map((item, order) => {
    const groupKey = buildGroupKey(item);
    const candidates = groups.get(groupKey) || [item];
    const baseKey = `${item.source}:${item.id}`;
    const count = seenKeys.get(baseKey) || 0;
    seenKeys.set(baseKey, count + 1);

    const entry: SearchDisplayItem = {
      key: count === 0 ? baseKey : `${baseKey}#${count}`,
      title: item.title,
      poster: item.poster || candidates.find((c) => c.poster)?.poster || '',
      year: item.year,
      type: item.episodes && item.episodes.length === 1 ? 'movie' : 'tv',
      douban_id: item.douban_id || 0,
      primary: item,
      candidates,
    };
    return { entry, score: scoreTitleRelevance(item, query), order };
  });

  if (query.trim()) {
    result.sort((a, b) => b.score - a.score || a.order - b.order);
  }
  return result.map((r) => r.entry);
}
