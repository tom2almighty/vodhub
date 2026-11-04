import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSourcePrefs } from '../hooks/useSourcePrefs';
import { useSources } from '../hooks/useSources';
import { SourcePreferencesSheet } from './SourcePreferencesSheet';

/**
 * Contextual entry point next to the search box. The count makes the current
 * selection visible without opening anything.
 */
export function SourceFilter() {
  const [open, setOpen] = useState(false);
  const { data: sources = [] } = useSources();
  const disabledIds = useSourcePrefs();

  const subscribed = sources.filter((s) => s.isEnabled);
  const activeCount = subscribed.filter((s) => !disabledIds.has(s.id)).length;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 shrink-0 gap-2 px-3"
        onClick={() => setOpen(true)}
        aria-label="选择参与搜索的视频源"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">视频源</span>
        {subscribed.length > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
            {activeCount}/{subscribed.length}
          </Badge>
        )}
      </Button>
      <SourcePreferencesSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
