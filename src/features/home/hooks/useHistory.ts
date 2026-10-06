import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { subscribeToDataUpdates } from '@/lib/db';
import { queryKeys } from '@/lib/query/keys';
import { playRecordsOptions } from '@/lib/query/options';
import type { PlayRecord } from '@/lib/types';

export function useHistory() {
  const queryClient = useQueryClient();
  const query = useQuery(playRecordsOptions());

  useEffect(() => {
    return subscribeToDataUpdates<Record<string, PlayRecord>>('playRecordsUpdated', (data) => {
      queryClient.setQueryData(queryKeys.playRecords, data);
    });
  }, [queryClient]);

  return query;
}
