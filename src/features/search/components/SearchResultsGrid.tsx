import { SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { AggregatedItem } from '../lib/aggregate';

const INITIAL_BATCH = 24;
const BATCH_SIZE = 18;

interface SearchResultsGridProps {
  items: AggregatedItem[];
  loading: boolean;
  query: string;
}

export function SearchResultsGrid({ items, loading, query }: SearchResultsGridProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset batch on query change
  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
  }, [query]);

  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, items.length));
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  if (items.length === 0 && !loading) {
    return (
      <Empty className="border border-border bg-card py-16">
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>未找到相关内容</EmptyTitle>
          <EmptyDescription>换个关键词试试</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (items.length === 0 && loading) {
    return (
      <PosterGrid>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-2/3" />
        ))}
      </PosterGrid>
    );
  }

  return (
    <>
      <PosterGrid>
        {visibleItems.map((item, i) => {
          const primary = item.group[0];
          return (
            // Entrance-only animation. The previous `layout` prop forced a
            // layout measurement of every mounted card on each batch append.
            <div
              key={item.key}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
            >
              <PosterCard
                variant="search"
                title={item.title}
                poster={item.poster}
                year={item.year}
                source={primary.source}
                id={primary.id}
                sourceName={primary.source_name}
                sourceNames={item.group.map((g) => g.source_name)}
                episodes={primary.episodes?.length || 0}
                doubanId={item.douban_id}
                candidates={item.group.length > 1 ? item.group : undefined}
                query={query}
              />
            </div>
          );
        })}
      </PosterGrid>
      {hasMore && <div ref={sentinelRef} className="h-10 w-full" />}
    </>
  );
}
