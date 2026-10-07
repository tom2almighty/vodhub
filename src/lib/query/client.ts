import { QueryClient } from '@tanstack/react-query';

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

/**
 * Drops every cached query. Used when a session ends so one user's data can't
 * survive into the next.
 *
 * Disk-backed caches are not re-seeded here: hooks that have one read it via
 * `initialData` at mount (see useRecommendations), which also means the default
 * gcTime can no longer evict a seed before the first render that wants it.
 */
export function resetQueryCache(): void {
  queryClient.clear();
}
