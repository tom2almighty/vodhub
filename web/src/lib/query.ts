import { QueryClient } from '@tanstack/react-query';
import type { DoubanKind } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function resetQueryCache(): void {
  queryClient.clear();
}

export const queryKeys = {
  site: ['site'] as const,
  sources: ['sources'] as const,
  adminSources: ['admin', 'sources'] as const,
  authVerify: ['auth', 'verify'] as const,
  recommendations: ['recommendations'] as const,
  douban: (params: { kind: DoubanKind; type: string }) => ['douban', params] as const,
  doubanCategories: ['douban', 'categories'] as const,
  playRecords: ['play-records'] as const,
  searchHistory: ['search-history'] as const,
};
