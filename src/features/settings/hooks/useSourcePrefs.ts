import { useEffect, useState } from 'react';
import {
  getSourceOverrides,
  type SourceOverrides,
  subscribeToSourcePrefs,
} from '@/lib/sourcePrefs';

/** Reactive view of per-browser source overrides on top of subscription defaults. */
export function useSourcePrefs(): SourceOverrides {
  const [overrides, setOverrides] = useState<SourceOverrides>(() => getSourceOverrides());

  useEffect(() => subscribeToSourcePrefs(() => setOverrides(getSourceOverrides())), []);

  return overrides;
}
