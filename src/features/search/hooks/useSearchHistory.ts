import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSearchHistory, subscribeToDataUpdates } from '@/lib/db';
import { queryKeys } from '@/lib/query/keys';

export function useSearchHistory(): UseQueryResult<string[], Error> {
  const queryClient = useQueryClient();
  const query = useQuery<string[], Error>({
    queryKey: [...queryKeys.searchHistory],
    queryFn: () => getSearchHistory(),
    staleTime: Infinity,
  });

  useEffect(() => {
    return subscribeToDataUpdates<string[]>('searchHistoryUpdated', (data) => {
      queryClient.setQueryData(queryKeys.searchHistory, data);
    });
  }, [queryClient]);

  return query;
}
