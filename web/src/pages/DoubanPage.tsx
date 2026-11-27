import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDoubanCategories, useDoubanCategory } from '@/hooks/useDouban';
import type { DoubanKind, RecommendationItem } from '@/lib/types';

const DOUBAN_KINDS: readonly DoubanKind[] = ['movie', 'tv', 'show'];
const LABELS: Record<DoubanKind, string> = { movie: '电影', tv: '剧集', show: '综艺' };

export default function DoubanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawKind = searchParams.get('kind') || searchParams.get('type');
  const kind: DoubanKind = (DOUBAN_KINDS as readonly string[]).includes(rawKind ?? '')
    ? (rawKind as DoubanKind)
    : 'movie';
  const type = searchParams.get('sub') || searchParams.get('type') || '';

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

  return (
    <div className="app-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">分类</h1>
        <Tabs
          value={kind}
          onValueChange={(v) => setSearchParams({ kind: v as DoubanKind }, { replace: true })}
        >
          <TabsList>
            {DOUBAN_KINDS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {options.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {options.map((opt) => (
            <Badge
              key={opt}
              variant={opt === activeType ? 'default' : 'secondary'}
              render={<button type="button" />}
              aria-pressed={opt === activeType}
              onClick={() => setSearchParams({ kind, sub: opt }, { replace: true })}
              className="h-auto cursor-pointer px-3 py-1 text-xs font-medium transition-colors"
            >
              {opt}
            </Badge>
          ))}
        </div>
      )}

      {query.isLoading ? (
        <PosterGrid>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-2/3" />
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
            <Spinner className="size-3" />
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
