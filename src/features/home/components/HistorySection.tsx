import { History } from 'lucide-react';
import { useMemo } from 'react';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterGrid } from '@/components/media/PosterGrid';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
        <Empty className="border border-border bg-card py-16">
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>暂无观看历史</EmptyTitle>
            <EmptyDescription>播放过的内容会出现在这里</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <PosterGrid>
          {items.map((item, i) => (
            <div
              key={item.storageKey}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
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
            </div>
          ))}
        </PosterGrid>
      )}
    </section>
  );
}
