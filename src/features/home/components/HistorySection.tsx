import { motion } from 'motion/react';
import { useMemo } from 'react';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import { Button } from '@/components/ui/button';
import { clearAllPlayRecords, parseStorageKey } from '@/lib/db';
import type { PlayRecord } from '@/lib/types';

interface HistorySectionProps {
  records: Record<string, PlayRecord>;
}

interface HistoryItem extends PlayRecord {
  storageKey: string;
  source: string;
  id: string;
}

function toItems(records: Record<string, PlayRecord>): HistoryItem[] {
  return Object.entries(records)
    .map(([storageKey, rec]) => {
      const parsed = parseStorageKey(storageKey);
      if (!parsed) return null;
      return { ...rec, storageKey, source: parsed.source, id: parsed.id };
    })
    .filter((x): x is HistoryItem => x !== null)
    .sort((a, b) => b.save_time - a.save_time);
}

export function HistorySection({ records }: HistorySectionProps) {
  const items = useMemo(() => toItems(records), [records]);

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">观看历史</h2>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearAllPlayRecords()}
            className="text-muted-foreground hover:text-destructive"
          >
            清空
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-20 text-center text-sm text-muted-foreground">
          暂无观看历史
        </div>
      ) : (
        <PosterGrid>
          {items.map((item, i) => (
            <motion.div
              key={item.storageKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.25 }}
            >
              <PosterCard
                variant="history"
                title={item.title}
                poster={item.cover}
                year={item.year}
                source={item.source}
                id={item.id}
                sourceName={item.source_name}
                episodes={item.total_episodes}
                currentEpisode={item.index + 1}
                progress={item.play_time}
                totalTime={item.total_time}
                query={item.search_title}
              />
            </motion.div>
          ))}
        </PosterGrid>
      )}
    </section>
  );
}
