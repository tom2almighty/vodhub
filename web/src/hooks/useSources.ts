import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchAdminSources, fetchSources } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import {
  getSourceOverrides,
  type SourceOverrides,
  subscribeToSourcePrefs,
} from '@/lib/sourcePrefs';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useSources(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) => fetchSources(signal),
    enabled,
    staleTime: FIVE_MINUTES,
  });
}

export function useAdminSources() {
  return useQuery({
    queryKey: queryKeys.adminSources,
    queryFn: ({ signal }) => fetchAdminSources(signal),
    staleTime: 30_000,
  });
}

export function useSourcePrefs(): SourceOverrides {
  const [overrides, setOverrides] = useState<SourceOverrides>(() => getSourceOverrides());
  useEffect(() => subscribeToSourcePrefs(() => setOverrides(getSourceOverrides())), []);
  return overrides;
}
