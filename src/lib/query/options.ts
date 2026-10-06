import { queryOptions } from '@tanstack/react-query';
import { fetchSiteConfig } from '@/lib/api/auth';
import {
  type DoubanCategoryParams,
  fetchDoubanCategories,
  fetchDoubanCategory,
} from '@/lib/api/douban';
import { fetchSourceDetail } from '@/lib/api/sources';
import { getAllPlayRecords, getSearchHistory } from '@/lib/db';
import { queryKeys } from './keys';

const THIRTY_MINUTES = 30 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export const siteOptions = () =>
  queryOptions({
    queryKey: queryKeys.site,
    queryFn: () => fetchSiteConfig(),
    staleTime: Infinity,
  });

export const detailOptions = (source: string, id: string) =>
  queryOptions({
    queryKey: queryKeys.detail(source, id),
    queryFn: ({ signal }) => fetchSourceDetail(source, id, signal),
    staleTime: FIVE_MINUTES,
  });

export const doubanCategoryOptions = (params: DoubanCategoryParams) =>
  queryOptions({
    queryKey: queryKeys.douban({ kind: params.kind, type: params.type }),
    queryFn: ({ signal }) => fetchDoubanCategory(params, signal),
    staleTime: THIRTY_MINUTES,
  });

export const doubanCategoriesOptions = () =>
  queryOptions({
    queryKey: queryKeys.doubanCategories,
    queryFn: ({ signal }) => fetchDoubanCategories(signal),
    staleTime: ONE_DAY,
  });

export const playRecordsOptions = () =>
  queryOptions({
    queryKey: queryKeys.playRecords,
    queryFn: () => getAllPlayRecords(),
    staleTime: Infinity,
  });

export const searchHistoryOptions = () =>
  queryOptions({
    queryKey: queryKeys.searchHistory,
    queryFn: () => getSearchHistory(),
    staleTime: Infinity,
  });
