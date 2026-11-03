import type { DoubanKind } from '@/lib/api/douban';

export const queryKeys = {
  site: ['site'] as const,
  sources: ['sources'] as const,
  authVerify: ['auth', 'verify'] as const,
  recommendations: ['recommendations'] as const,
  douban: (params: { kind: DoubanKind; type: string }) => ['douban', params] as const,
  doubanCategories: ['douban', 'categories'] as const,
  detail: (source: string, id: string) => ['detail', source, id] as const,
  search: (query: string) => ['search', query] as const,
  playRecords: ['play-records'] as const,
  searchHistory: ['search-history'] as const,
};
