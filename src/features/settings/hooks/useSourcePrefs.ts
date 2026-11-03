import { useEffect, useState } from 'react';
import { getDisabledSourceIds, subscribeToSourcePrefs } from '@/lib/sourcePrefs';

/** Reactive view of the per-browser disabled-source set. */
export function useSourcePrefs(): Set<string> {
  const [disabled, setDisabled] = useState<Set<string>>(() => getDisabledSourceIds());

  useEffect(() => subscribeToSourcePrefs(() => setDisabled(getDisabledSourceIds())), []);

  return disabled;
}
