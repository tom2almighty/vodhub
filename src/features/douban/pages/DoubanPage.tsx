import { useEffect, useMemo, useRef } from 'react';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecommendationItem } from '@/lib/types';
import { CategoryTabs, SubcategoryChips, useDoubanType } from '../components/CategoryTabs';
import { useDoubanCategories } from '../hooks/useDoubanCategories';
import { useDoubanCategory } from '../hooks/useDoubanCategory';

export default function DoubanPage() {
  const { kind, setKind, type, setType } = useDoubanType();
  const categories = useDoubanCategories();
  const loaderRef = useRef<HTMLDivElement>(null);

  const options = categories[kind] || [];
  const activeType = options.includes(type) ? type : options[0] || '';

  const query = useDoubanCategory({ kind, type: activeType });
  const items = useMemo<RecommendationItem[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  useEffect(() => {
    if (!loaderRef.current || !query.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [query]);

  const isInitialLoading = query.isLoading;

  return (
    <div className="app-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">分类</h1>
        <CategoryTabs value={kind} onChange={setKind} />
      </div>

      {options.length > 1 && (
        <div className="mb-6">
          <SubcategoryChips options={options} value={activeType} onChange={setType} />
        </div>
      )}

      {isInitialLoading ? (
        <PosterGrid>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </PosterGrid>
      ) : (
        <PosterGrid>
          {items.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i % 18, 12) * 20}ms` }}
            >
              <PosterCard
                variant="douban"
                title={item.title}
                poster={item.poster}
                year={item.year}
                rating={item.rating}
                doubanId={Number(item.id)}
                doubanType={kind}
              />
            </div>
          ))}
        </PosterGrid>
      )}

      <div ref={loaderRef} className="py-10 text-center">
        {query.isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            加载中
          </span>
        )}
        {!query.hasNextPage && items.length > 0 && (
          <span className="text-sm text-muted-foreground">— 已加载完毕 —</span>
        )}
      </div>
    </div>
  );
}
