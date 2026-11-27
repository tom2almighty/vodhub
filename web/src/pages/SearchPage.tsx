import { Search as SearchIcon, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import { SourceFilter } from '@/components/SourcePickerSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useSearchHistory, useSearchHistoryMutations } from '@/hooks/useHistory';
import { useSearchStream } from '@/hooks/useSearchStream';
import { useSources } from '@/hooks/useSources';
import {
  aggregateResults,
  buildSourceRankMap,
  flattenResults,
  type SearchDisplayItem,
} from '@/lib/search';

const AGGREGATE_PREF_KEY = 'vodhub_search_aggregate';
const INITIAL_BATCH = 24;
const BATCH_SIZE = 18;

function readAggregatePref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(AGGREGATE_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

function SearchHistorySection({ onPick }: { onPick: (keyword: string) => void }) {
  const { data: history = [] } = useSearchHistory();
  const { remove, clear } = useSearchHistoryMutations();

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">搜索历史</h2>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clear.mutate()}
            className="text-muted-foreground hover:text-destructive"
          >
            清空
          </Button>
        )}
      </div>
      {history.length === 0 ? (
        <Empty className="border border-border bg-card py-12">
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>暂无搜索历史</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {history.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="h-auto gap-1.5 py-1 pl-3 pr-1.5 text-sm font-normal"
            >
              <button
                type="button"
                onClick={() => onPick(item)}
                className="cursor-pointer transition-colors hover:text-foreground focus-visible:text-foreground"
              >
                {item}
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(item)}
                className="rounded-full p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-destructive hover:text-destructive-foreground hover:opacity-100 focus-visible:opacity-100"
                aria-label={`删除 ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultsGrid({
  items,
  loading,
  query,
  noSources,
}: {
  items: SearchDisplayItem[];
  loading: boolean;
  query: string;
  noSources: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset visible slice when query changes
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
          <EmptyTitle>{noSources ? '当前没有可用的视频源' : '未找到相关内容'}</EmptyTitle>
          <EmptyDescription>
            {noSources ? '请在“视频源”中启用至少一个源，或前往视频源管理添加' : '换个关键词试试'}
          </EmptyDescription>
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
          const { primary, candidates } = item;
          return (
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
                sourceNames={item.sourceNames}
                episodes={primary.episodes?.length || 0}
                doubanId={item.douban_id}
                candidates={candidates.length > 1 ? candidates : undefined}
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

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);
  const [aggregated, setAggregated] = useState<boolean>(readAggregatePref);
  const inputRef = useRef<HTMLInputElement>(null);
  const { add: addHistory } = useSearchHistoryMutations();

  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  const handleAggregatedChange = useCallback((next: boolean) => {
    setAggregated(next);
    try {
      localStorage.setItem(AGGREGATE_PREF_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const stream = useSearchStream(queryFromUrl);
  const { data: sources = [] } = useSources();
  const sourceRanks = useMemo(() => buildSourceRankMap(sources), [sources]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: addHistory.mutate is stable
  useEffect(() => {
    const trimmed = queryFromUrl.trim();
    if (trimmed) addHistory.mutate(trimmed);
  }, [queryFromUrl]);

  const displayItems = useMemo(
    () =>
      aggregated
        ? aggregateResults(stream.items, queryFromUrl, sourceRanks)
        : flattenResults(stream.items, queryFromUrl, sourceRanks),
    [aggregated, stream.items, queryFromUrl, sourceRanks],
  );
  const isLoading = stream.status === 'loading';

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setSearchParams({ q: trimmed }, { replace: true });
    },
    [setSearchParams],
  );

  const handlePick = useCallback(
    (keyword: string) => {
      setInput(keyword);
      handleSubmit(keyword);
    },
    [handleSubmit],
  );

  const showingResults = !!queryFromUrl.trim();
  const pct = stream.total > 0 ? Math.min(100, (stream.completed / stream.total) * 100) : 0;

  return (
    <div className="app-page">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(input);
        }}
        className="mb-8"
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜索电影、剧集、综艺..."
              aria-label="搜索电影、剧集、综艺"
              autoComplete="off"
              autoFocus
              className="h-12 pl-10 pr-12 text-sm"
            />
            {input && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setInput('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                aria-label="清空"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            )}
          </div>
          <SourceFilter />
        </div>
      </form>

      {showingResults ? (
        <section>
          {(stream.total > 0 || isLoading) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold">搜索结果</h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {displayItems.length} {aggregated ? '部' : '条'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="search-aggregate-toggle"
                    size="sm"
                    checked={aggregated}
                    onCheckedChange={handleAggregatedChange}
                  />
                  <Label
                    htmlFor="search-aggregate-toggle"
                    className="cursor-pointer text-xs font-normal text-muted-foreground"
                  >
                    聚合同名结果
                  </Label>
                </div>
                {stream.total > 0 && (
                  <div className="flex items-center gap-2.5">
                    {isLoading && <Spinner className="size-3" />}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {stream.completed}/{stream.total} 源
                    </span>
                    <Progress value={pct} className="h-1 w-20 sm:w-24" />
                  </div>
                )}
              </div>
            </div>
          )}
          <ResultsGrid
            items={displayItems}
            loading={isLoading}
            query={queryFromUrl}
            noSources={stream.status === 'done' && stream.total === 0}
          />
        </section>
      ) : (
        <SearchHistorySection onPick={handlePick} />
      )}
    </div>
  );
}
