import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { clearSearchHistory, deleteSearchHistory } from '@/lib/db';
import { useSearchHistory } from '../hooks/useSearchHistory';

interface SearchHistoryChipsProps {
  onPick: (keyword: string) => void;
}

export function SearchHistoryChips({ onPick }: SearchHistoryChipsProps) {
  const { data: history = [] } = useSearchHistory();

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">搜索历史</h2>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearSearchHistory()}
            className="text-muted-foreground hover:text-destructive"
          >
            清空
          </Button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          暂无搜索历史
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {history.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              onClick={() => onPick(item)}
              className="cursor-pointer gap-1.5 px-3 py-1 text-sm font-normal hover:bg-accent hover:text-foreground"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSearchHistory(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    deleteSearchHistory(item);
                  }
                }}
                className="rounded-full p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-destructive hover:text-destructive-foreground hover:opacity-100"
                aria-label="删除"
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
