import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
        <Empty className="border border-border bg-card py-12">
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>暂无搜索历史</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {history.map((item) => (
            // Badge renders a <span>, so the keyword and the delete action are
            // siblings here. Previously the delete button was nested inside a
            // clickable badge: invalid interactive nesting, and the badge itself
            // could not take focus, making the delete button unreachable.
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
                onClick={() => deleteSearchHistory(item)}
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
