import type { SearchResult, SourceOption } from './types';

export interface SourceRank {
  weight: number;
  order: number;
}

export function buildSourceRankMap(sources: SourceOption[]): Map<string, SourceRank> {
  const map = new Map<string, SourceRank>();
  for (let i = 0; i < sources.length; i++) {
    map.set(sources[i].id, { weight: sources[i].weight ?? 0, order: i });
  }
  return map;
}

function getRank(sourceId: string, ranks?: Map<string, SourceRank>): SourceRank {
  return ranks?.get(sourceId) ?? { weight: 0, order: Number.MAX_SAFE_INTEGER };
}

function sortBySourcePriority(
  items: SearchResult[],
  ranks?: Map<string, SourceRank>,
): SearchResult[] {
  if (!ranks || ranks.size === 0 || items.length <= 1) return items;
  return items
    .map((item, idx) => ({ item, rank: getRank(item.source, ranks), idx }))
    .sort((a, b) => b.rank.weight - a.rank.weight || a.rank.order - b.rank.order || a.idx - b.idx)
    .map((x) => x.item);
}

export interface SearchDisplayItem {
  key: string;
  title: string;
  poster: string;
  year: string;
  type: 'movie' | 'tv';
  douban_id: number;
  primary: SearchResult;
  candidates: SearchResult[];
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

export function aggregateResults(
  items: SearchResult[],
  query = '',
  sourceRanks?: Map<string, SourceRank>,
): SearchDisplayItem[] {
  const groups = groupByTitle(items);
  const result: Array<{
    entry: SearchDisplayItem;
    score: number;
    weight: number;
    sourceOrder: number;
    arrival: number;
  }> = [];
  let arrival = 0;

  for (const [key, rawGroup] of groups) {
    const group = sortBySourcePriority(rawGroup, sourceRanks);
    const primary = group[0];
    const primaryRank = getRank(primary.source, sourceRanks);
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
    result.push({
      entry,
      score: scoreTitleRelevance(primary, query),
      weight: primaryRank.weight,
      sourceOrder: primaryRank.order,
      arrival: arrival++,
    });
  }

  result.sort((a, b) => {
    if (query.trim() && b.score !== a.score) return b.score - a.score;
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.entry.candidates.length !== a.entry.candidates.length) {
      return b.entry.candidates.length - a.entry.candidates.length;
    }
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return a.arrival - b.arrival;
  });
  return result.map((r) => r.entry);
}

export function flattenResults(
  items: SearchResult[],
  query = '',
  sourceRanks?: Map<string, SourceRank>,
): SearchDisplayItem[] {
  const rawGroups = groupByTitle(items);
  const sortedGroups = new Map<string, SearchResult[]>();
  for (const [k, g] of rawGroups) {
    sortedGroups.set(k, sortBySourcePriority(g, sourceRanks));
  }
  const seenKeys = new Map<string, number>();

  const result = items.map((item, arrival) => {
    const groupKey = buildGroupKey(item);
    const candidates = sortedGroups.get(groupKey) || [item];
    const baseKey = `${item.source}:${item.id}`;
    const count = seenKeys.get(baseKey) || 0;
    seenKeys.set(baseKey, count + 1);
    const rank = getRank(item.source, sourceRanks);

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
    return {
      entry,
      score: scoreTitleRelevance(item, query),
      weight: rank.weight,
      sourceOrder: rank.order,
      arrival,
    };
  });

  result.sort((a, b) => {
    if (query.trim() && b.score !== a.score) return b.score - a.score;
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return a.arrival - b.arrival;
  });
  return result.map((r) => r.entry);
}
