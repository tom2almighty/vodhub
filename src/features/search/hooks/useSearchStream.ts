import { useEffect, useState } from 'react';
import { searchStream } from '@/lib/api/sources';
import type { SearchResult } from '@/lib/types';

export type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

export interface SearchStreamState {
  items: SearchResult[];
  total: number;
  completed: number;
  status: SearchStatus;
}

const INITIAL: SearchStreamState = { items: [], total: 0, completed: 0, status: 'idle' };

export function useSearchStream(query: string): SearchStreamState {
  const [state, setState] = useState<SearchStreamState>(INITIAL);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setState(INITIAL);
      return;
    }
    const controller = new AbortController();
    setState({ items: [], total: 0, completed: 0, status: 'loading' });

    searchStream(
      trimmed,
      {
        onStart: (total) => setState((s) => ({ ...s, total })),
        onResult: (items) => setState((s) => ({ ...s, items: [...s.items, ...items] })),
        onProgress: (completed) => setState((s) => ({ ...s, completed })),
        onComplete: (_total, completed) => setState((s) => ({ ...s, completed, status: 'done' })),
      },
      controller.signal,
    ).catch((err: Error) => {
      if (err?.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error' }));
    });

    return () => controller.abort();
  }, [query]);

  return state;
}
