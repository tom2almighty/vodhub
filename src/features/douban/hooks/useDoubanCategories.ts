import { useQuery } from '@tanstack/react-query';
import type { DoubanCategories } from '@/lib/api/douban';
import { doubanCategoriesOptions } from '@/lib/query/options';

const FALLBACK: DoubanCategories = {
  movie: ['全部', '华语', '欧美', '韩国', '日本'],
  tv: ['综合', '国产剧', '欧美剧', '日剧', '韩剧', '动画', '纪录片'],
  show: ['综合', '国内', '国外'],
};

export function useDoubanCategories(): DoubanCategories {
  const { data } = useQuery(doubanCategoriesOptions());
  return data ?? FALLBACK;
}
