import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

interface SearchProgressProps {
  total: number;
  completed: number;
  loading: boolean;
  resultsCount: number;
  aggregated: boolean;
  onAggregatedChange: (next: boolean) => void;
}

export function SearchProgress({
  total,
  completed,
  loading,
  resultsCount,
  aggregated,
  onAggregatedChange,
}: SearchProgressProps) {
  if (total === 0 && !loading) return null;
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">搜索结果</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {resultsCount} {aggregated ? '部' : '条'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="search-aggregate-toggle"
            size="sm"
            checked={aggregated}
            onCheckedChange={onAggregatedChange}
          />
          <Label
            htmlFor="search-aggregate-toggle"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            聚合同名结果
          </Label>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2.5">
            {loading && <Spinner className="size-3" />}
            <span className="text-xs tabular-nums text-muted-foreground">
              {completed}/{total} 源
            </span>
            <Progress value={pct} className="h-1 w-20 sm:w-24" />
          </div>
        )}
      </div>
    </div>
  );
}
