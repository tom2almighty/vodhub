import { useQuery } from '@tanstack/react-query';
import { fetchSources } from '@/lib/api/sources';
import { queryKeys } from '@/lib/query/keys';

const FIVE_MINUTES = 5 * 60 * 1000;

/** `enabled` keeps the list request out of the initial page load. */
export function useSources(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) => fetchSources(signal),
    enabled,
    staleTime: FIVE_MINUTES,
  });
}
