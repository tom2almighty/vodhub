import { Search } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { SourceOption } from '@/lib/api/sources';
import {
  isSourceActive,
  resetSourceOverrides,
  setSourceOverride,
  setSourcesOverride,
} from '@/lib/sourcePrefs';
import { cn } from '@/lib/utils';
import { useSourcePrefs } from '../hooks/useSourcePrefs';
import { useSources } from '../hooks/useSources';

const SEARCH_FILTER_THRESHOLD = 6;

interface SourcePreferencesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourcePreferencesSheet({ open, onOpenChange }: SourcePreferencesSheetProps) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>视频源</SheetTitle>
          <SheetDescription>
            默认开关由订阅端控制，可根据需要手动开启或关闭，仅保存在当前浏览器。
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
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

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 pb-4">
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
              <p className="py-12 text-center text-sm text-muted-foreground">
                {sources.length === 0 ? '暂无可用视频源' : '没有匹配的源'}
              </p>
            ) : (
              <>
                {visibleDefaultOn.length > 0 && (
                  <ul className="grid grid-cols-2 gap-1.5">{visibleDefaultOn.map(renderSource)}</ul>
                )}
                {visibleDefaultOff.length > 0 && (
                  <div className={cn(visibleDefaultOn.length > 0 && 'mt-4')}>
                    <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                      订阅默认关闭（需要时可手动开启）
                    </p>
                    <ul className="grid grid-cols-2 gap-1.5">
                      {visibleDefaultOff.map(renderSource)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
