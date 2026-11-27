import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import {
  fetchDoubanCategories,
  fetchDoubanCategory,
  fetchRecommendations,
  getDoubanCategoryCacheKey,
} from '@/lib/api';
import { queryKeys } from '@/lib/query';
import {
  getCachedDoubanCategory,
  getCachedRecommendations,
  setCachedDoubanCategory,
  setCachedRecommendations,
} from '@/lib/storage';
import type {
  DoubanCategories,
  DoubanCategoryResult,
  DoubanKind,
  RecommendationHomeResult,
} from '@/lib/types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 18;

const FALLBACK_CATEGORIES: DoubanCategories = {
  movie: ['全部', '华语', '欧美', '韩国', '日本'],
  tv: ['综合', '国产剧', '欧美剧', '日剧', '韩剧', '动画', '纪录片'],
  show: ['综合', '国内', '国外'],
};

export function useRecommendations(): UseQueryResult<RecommendationHomeResult, Error> {
  return useQuery<RecommendationHomeResult, Error>({
    queryKey: queryKeys.recommendations,
    queryFn: async ({ signal }) => {
      const data = await fetchRecommendations(signal);
      setCachedRecommendations(data);
      return data;
    },
    initialData: () => getCachedRecommendations() ?? undefined,
    staleTime: SEVEN_DAYS,
    gcTime: SEVEN_DAYS,
  });
}

export function useDoubanCategories(): DoubanCategories {
  const { data } = useQuery({
    queryKey: queryKeys.doubanCategories,
    queryFn: ({ signal }) => fetchDoubanCategories(signal),
    staleTime: ONE_DAY,
  });
  return data ?? FALLBACK_CATEGORIES;
}

export function useDoubanCategory(key: {
  kind: DoubanKind;
  type: string;
}): UseInfiniteQueryResult<InfiniteData<DoubanCategoryResult, number>, Error> {
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
