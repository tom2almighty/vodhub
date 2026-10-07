import { QueryClient } from '@tanstack/react-query';
import { getCachedRecommendations } from '@/lib/db';
import { queryKeys } from './keys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Seed local caches into the query cache so initial renders can read from disk
// without each hook needing initialData.
function seedFromLocalCache(): void {
  if (typeof window === 'undefined') return;
  const recommendations = getCachedRecommendations();
  if (recommendations) {
    queryClient.setQueryData(queryKeys.recommendations, recommendations);
  }
}

seedFromLocalCache();

/**
 * Drops every cached query and re-seeds the on-disk caches. Used when the
 * session ends so one user's data can't survive into the next, without
 * discarding the offline recommendation cache in the process.
 */
export function resetQueryCache(): void {
  queryClient.clear();
  seedFromLocalCache();
}
