import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { fetchRecommendations } from '@/lib/api/douban';
import { setCachedRecommendations } from '@/lib/db';
import type { RecommendationHomeResult } from '@/lib/types';

const REC_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function useRecommendations(): UseQueryResult<RecommendationHomeResult, Error> {
  return useQuery<RecommendationHomeResult, Error>({
    queryKey: ['recommendations'],
    queryFn: async ({ signal }) => {
      const data = await fetchRecommendations(signal);
      setCachedRecommendations(data);
      return data;
    },
    staleTime: REC_STALE_MS,
    gcTime: REC_STALE_MS,
  });
}
