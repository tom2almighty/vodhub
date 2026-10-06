import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addSearchHistory } from '@/lib/db';
import { SearchBar } from '../components/SearchBar';
import { SearchHistoryChips } from '../components/SearchHistoryChips';
import { SearchProgress } from '../components/SearchProgress';
import { SearchResultsGrid } from '../components/SearchResultsGrid';
import { useSearchStream } from '../hooks/useSearchStream';
import { aggregateResults } from '../lib/aggregate';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);

  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  const stream = useSearchStream(queryFromUrl);

  useEffect(() => {
    if (queryFromUrl.trim()) {
      addSearchHistory(queryFromUrl.trim());
    }
  }, [queryFromUrl]);

  const aggregated = useMemo(() => aggregateResults(stream.items), [stream.items]);
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
      <SearchBar value={input} onChange={setInput} onSubmit={handleSubmit} />

      {showingResults ? (
        <section>
          <SearchProgress
            total={stream.total}
            completed={stream.completed}
            loading={isLoading}
            resultsCount={aggregated.length}
          />
          <SearchResultsGrid items={aggregated} loading={isLoading} query={queryFromUrl} />
        </section>
      ) : (
        <SearchHistoryChips onPick={handlePick} />
      )}
    </div>
  );
}
