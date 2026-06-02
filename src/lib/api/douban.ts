import type { RecommendationHomeResult, RecommendationItem } from '@/lib/types';
import { apiJson } from './client';

export type DoubanKind = 'movie' | 'tv' | 'show';

export interface DoubanCategoryParams {
  kind: DoubanKind;
  type: string;
  start?: number;
  limit?: number;
}

export interface DoubanCategoryResult {
  items: RecommendationItem[];
  total: number;
}

export interface DoubanCategories {
  movie: string[];
  tv: string[];
  show: string[];
}

export function getDoubanCategoryCacheKey(params: DoubanCategoryParams): string {
  return [
    params.kind,
    params.type,
    String(params.start ?? 0),
    String(params.limit ?? 18),
  ].join('|');
}

export async function fetchDoubanCategory(
  params: DoubanCategoryParams,
  signal?: AbortSignal,
): Promise<DoubanCategoryResult> {
  const search = new URLSearchParams({
    kind: params.kind,
    type: params.type,
    start: String(params.start ?? 0),
    limit: String(params.limit ?? 18),
  });
  return apiJson<DoubanCategoryResult>(`/api/douban/category?${search.toString()}`, { signal });
}

export async function fetchDoubanCategories(signal?: AbortSignal): Promise<DoubanCategories> {
  return apiJson<DoubanCategories>('/api/douban/categories', { signal });
}

export async function fetchRecommendations(signal?: AbortSignal): Promise<RecommendationHomeResult> {
  return apiJson<RecommendationHomeResult>('/api/recommendations', { signal });
}
