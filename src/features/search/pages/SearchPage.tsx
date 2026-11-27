import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SourceFilter } from '@/features/settings/components/SourceFilter';
import { addSearchHistory } from '@/lib/db';
import { SearchBar } from '../components/SearchBar';
import { SearchHistoryChips } from '../components/SearchHistoryChips';
import { SearchProgress } from '../components/SearchProgress';
import { SearchResultsGrid } from '../components/SearchResultsGrid';
import { useSearchStream } from '../hooks/useSearchStream';
import { aggregateResults, flattenResults } from '../lib/aggregate';

const AGGREGATE_PREF_KEY = 'vodhub_search_aggregate';

function readAggregatePref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(AGGREGATE_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);
  const [aggregated, setAggregated] = useState<boolean>(readAggregatePref);

  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  const handleAggregatedChange = useCallback((next: boolean) => {
    setAggregated(next);
    try {
      localStorage.setItem(AGGREGATE_PREF_KEY, String(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const stream = useSearchStream(queryFromUrl);

  useEffect(() => {
    if (queryFromUrl.trim()) {
      addSearchHistory(queryFromUrl.trim());
    }
  }, [queryFromUrl]);

  const displayItems = useMemo(
    () =>
      aggregated
        ? aggregateResults(stream.items, queryFromUrl)
        : flattenResults(stream.items, queryFromUrl),
    [aggregated, stream.items, queryFromUrl],
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

  return (
    <div className="app-page">
      <SearchBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        action={<SourceFilter />}
      />

      {showingResults ? (
        <section>
          <SearchProgress
            total={stream.total}
            completed={stream.completed}
            loading={isLoading}
            resultsCount={displayItems.length}
            aggregated={aggregated}
            onAggregatedChange={handleAggregatedChange}
          />
          <SearchResultsGrid
            items={displayItems}
            loading={isLoading}
            query={queryFromUrl}
            noSources={stream.status === 'done' && stream.total === 0}
          />
        </section>
      ) : (
        <SearchHistoryChips onPick={handlePick} />
      )}
    </div>
  );
}
