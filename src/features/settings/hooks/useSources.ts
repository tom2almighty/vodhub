import { useQuery } from '@tanstack/react-query';
import { fetchSources } from '@/lib/api/sources';
import { queryKeys } from '@/lib/query/keys';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * The search page needs the list on mount for its enabled/total count; the
 * settings sheet reuses the same cached query when it opens.
 */
export function useSources(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) => fetchSources(signal),
    enabled,
    staleTime: FIVE_MINUTES,
  });
}
