import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import {
  fetchDoubanCategory,
  getDoubanCategoryCacheKey,
  type DoubanCategoryResult,
  type DoubanKind,
} from '@/lib/api/douban';
import { getCachedDoubanCategory, setCachedDoubanCategory } from '@/lib/db';
import { queryKeys } from '@/lib/query/keys';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 18;

export interface DoubanCategoryKey {
  kind: DoubanKind;
  type: string;
}

export function useDoubanCategory(
  key: DoubanCategoryKey,
): UseInfiniteQueryResult<InfiniteData<DoubanCategoryResult, number>, Error> {
  return useInfiniteQuery<
    DoubanCategoryResult,
    Error,
    InfiniteData<DoubanCategoryResult, number>,
    ReturnType<typeof queryKeys.douban>,
    number
  >({
    queryKey: queryKeys.douban(key),
    queryFn: async ({ pageParam = 0, signal }) => {
      const params = { ...key, start: pageParam, limit: PAGE_SIZE };
      const cacheKey = getDoubanCategoryCacheKey(params);
      const cached = getCachedDoubanCategory(cacheKey);
      if (cached) return cached;
      const data = await fetchDoubanCategory(params, signal);
      setCachedDoubanCategory(cacheKey, data);
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.items?.length || lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: SEVEN_DAYS,
  });
}
