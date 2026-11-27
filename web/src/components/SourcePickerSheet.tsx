import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useSourcePrefs, useSources } from '@/hooks/useSources';
import {
  isSourceActive,
  resetSourceOverrides,
  setSourceOverride,
  setSourcesOverride,
} from '@/lib/sourcePrefs';
import type { SourceOption } from '@/lib/types';
import { cn } from '@/lib/utils';

const SEARCH_FILTER_THRESHOLD = 6;

export function SourcePickerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAdmin } = useAuth();
  const { data: sources = [], isLoading, isError, refetch } = useSources(open);
  const overrides = useSourcePrefs();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) setFilter('');
  }, [open]);

  const activeCount = useMemo(
    () => sources.filter((s) => isSourceActive(s, overrides)).length,
    [sources, overrides],
  );
  const hasOverrides = useMemo(
    () => sources.some((s) => s.id in overrides && overrides[s.id] !== s.isEnabled),
    [sources, overrides],
  );
  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return sources;
    return sources.filter(
      (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword),
    );
  }, [filter, sources]);
  const visibleDefaultOn = visible.filter((s) => s.isEnabled);
  const visibleDefaultOff = visible.filter((s) => !s.isEnabled);

  const toggle = (source: SourceOption, enabled: boolean) => {
    if (!setSourceOverride(source.id, enabled, source.isEnabled)) {
      toast.error('浏览器存储不可用，设置未保存');
    }
  };

  const toggleAll = (enabled: boolean) => {
    if (sources.length === 0) return;
    if (!setSourcesOverride(sources, enabled)) {
      toast.error('浏览器存储不可用，设置未保存');
    }
  };

  const handleReset = () => {
    if (!resetSourceOverrides()) {
      toast.error('浏览器存储不可用，设置未保存');
    }
  };

  const renderSource = (source: SourceOption): ReactNode => {
    const checkboxId = `source-toggle-${source.id}`;
    const checked = isSourceActive(source, overrides);
    const overridden = source.id in overrides && overrides[source.id] !== source.isEnabled;

    return (
      <li key={source.id}>
        <div
          title={source.id}
          className={cn(
            'flex items-center gap-2 rounded-md border px-2 py-2 transition-colors',
            checked
              ? 'border-primary/40 bg-accent hover:bg-accent/80'
              : 'border-border hover:bg-muted/60',
          )}
        >
          <Checkbox
            id={checkboxId}
            checked={checked}
            onCheckedChange={(value) => toggle(source, value)}
          />
          <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
            {source.name}
          </label>
          {overridden && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {checked ? '已手动开' : '已手动关'}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>视频源开关</DialogTitle>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link to="/sources" onClick={() => onOpenChange(false)} />}
                className="h-7 gap-1 text-xs text-muted-foreground"
              >
                管理全部源
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <DialogDescription>按需开启或关闭参与搜索的视频源。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {sources.length > SEARCH_FILTER_THRESHOLD && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="搜索源名称或 ID"
                className="pl-8"
                aria-label="搜索视频源"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              已启用 {activeCount} / {sources.length} 个源
            </span>
            <div className="flex items-center gap-1.5">
              {hasOverrides && (
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  恢复默认
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(true)}
                disabled={sources.length === 0 || activeCount === sources.length}
              >
                全开
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(false)}
                disabled={activeCount === 0}
              >
                全关
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="h-72 pr-2">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium">视频源列表加载失败</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                重试
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {sources.length === 0 ? '尚未配置视频源' : '没有匹配的源'}
              </p>
              {sources.length === 0 && isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/sources" onClick={() => onOpenChange(false)} />}
                >
                  前往视频源管理
                </Button>
              )}
            </div>
          ) : (
            <>
              {visibleDefaultOn.length > 0 && (
                <ul className="grid grid-cols-2 gap-1.5">{visibleDefaultOn.map(renderSource)}</ul>
              )}
              {visibleDefaultOff.length > 0 && (
                <div className={cn(visibleDefaultOn.length > 0 && 'mt-4')}>
                  <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                    默认关闭（可手动开启）
                  </p>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {visibleDefaultOff.map(renderSource)}
                  </ul>
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function SourceFilter() {
  const [open, setOpen] = useState(false);
  const { data: sources = [] } = useSources();
  const overrides = useSourcePrefs();
  const activeCount = sources.filter((s) => isSourceActive(s, overrides)).length;

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
        {sources.length > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
            {activeCount}/{sources.length}
          </Badge>
        )}
      </Button>
      <SourcePickerSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
