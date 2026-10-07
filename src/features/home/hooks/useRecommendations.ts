import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { fetchRecommendations } from '@/lib/api/douban';
import { getCachedRecommendations, setCachedRecommendations } from '@/lib/db';
import { queryKeys } from '@/lib/query/keys';
import type { RecommendationHomeResult } from '@/lib/types';

const REC_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function useRecommendations(): UseQueryResult<RecommendationHomeResult, Error> {
  return useQuery<RecommendationHomeResult, Error>({
    queryKey: queryKeys.recommendations,
    queryFn: async ({ signal }) => {
      const data = await fetchRecommendations(signal);
      setCachedRecommendations(data);
      return data;
    },
    // Read the on-disk cache at mount. A module-load seed into the query cache
    // would be evicted by the default 5-minute gcTime whenever Home is not the
    // first route visited.
    initialData: () => getCachedRecommendations() ?? undefined,
    staleTime: REC_STALE_MS,
    gcTime: REC_STALE_MS,
  });
}
