import { useEffect, useState } from 'react';
import {
  addSearchHistory,
  clearAllPlayRecords,
  clearSearchHistory,
  deletePlayRecord,
  deleteSearchHistory,
  getAllPlayRecords,
  getSearchHistory,
  subscribeLocalData,
} from '@/lib/storage';
import type { PlayRecord } from '@/lib/types';

export function useHistory() {
  const [data, setData] = useState<Record<string, PlayRecord>>(() => getAllPlayRecords());

  useEffect(() => {
    return subscribeLocalData<Record<string, PlayRecord>>('playRecordsUpdated', setData);
  }, []);

  return { data, isLoading: false };
}

export function useHistoryMutations() {
  return {
    removeOne: {
      isPending: false,
      mutate: ({ source, id }: { source: string; id: string }) => deletePlayRecord(source, id),
    },
    clearAll: {
      isPending: false,
      mutate: () => clearAllPlayRecords(),
    },
  };
}

export function useSearchHistory() {
  const [data, setData] = useState<string[]>(() => getSearchHistory());

  useEffect(() => {
    return subscribeLocalData<string[]>('searchHistoryUpdated', setData);
  }, []);

  return { data };
}

export function useSearchHistoryMutations() {
  return {
    add: { mutate: (keyword: string) => addSearchHistory(keyword) },
    remove: { mutate: (keyword: string) => deleteSearchHistory(keyword) },
    clear: { mutate: () => clearSearchHistory() },
  };
}
