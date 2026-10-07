import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

interface SearchProgressProps {
  total: number;
  completed: number;
  loading: boolean;
  resultsCount: number;
}

export function SearchProgress({ total, completed, loading, resultsCount }: SearchProgressProps) {
  if (total === 0 && !loading) return null;
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">搜索结果</h2>
        <span className="text-sm text-muted-foreground">{resultsCount} 部</span>
      </div>
      {total > 0 && (
        <div className="flex items-center gap-3">
          {loading && <Spinner className="size-3" />}
          <span className="text-xs tabular-nums text-muted-foreground">
            {completed}/{total} 源
          </span>
          <Progress value={pct} className="h-1 w-24" />
        </div>
      )}
    </div>
  );
}
