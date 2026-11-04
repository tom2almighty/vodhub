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
import { setSourceEnabled, setSourcesEnabled } from '@/lib/sourcePrefs';
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
  const disabledIds = useSourcePrefs();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) setFilter('');
  }, [open]);

  const subscribed = useMemo(() => sources.filter((s) => s.isEnabled), [sources]);
  const activeCount = useMemo(
    () => subscribed.filter((s) => !disabledIds.has(s.id)).length,
    [subscribed, disabledIds],
  );
  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return sources;
    return sources.filter(
      (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword),
    );
  }, [filter, sources]);
  const visibleEnabled = visible.filter((s) => s.isEnabled);
  const visibleDisabled = visible.filter((s) => !s.isEnabled);

  const toggle = (id: string, enabled: boolean) => {
    if (!setSourceEnabled(id, enabled)) toast.error('浏览器存储不可用，设置未保存');
  };

  const toggleAll = (enabled: boolean) => {
    if (subscribed.length === 0) return;
    if (
      !setSourcesEnabled(
        subscribed.map((s) => s.id),
        enabled,
      )
    ) {
      toast.error('浏览器存储不可用，设置未保存');
    }
  };

  const renderSource = (source: SourceOption): ReactNode => {
    const checkboxId = `source-toggle-${source.id}`;
    const checked = source.isEnabled && !disabledIds.has(source.id);

    return (
      <li key={source.id}>
        <div
          title={source.id}
          className={cn(
            'flex items-center gap-2 rounded-md border px-2 py-2 transition-colors',
            checked
              ? 'border-primary/40 bg-accent hover:bg-accent/80'
              : 'border-border hover:bg-muted/60',
            !source.isEnabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
          )}
        >
          <Checkbox
            id={checkboxId}
            checked={checked}
            disabled={!source.isEnabled}
            onCheckedChange={(value) => toggle(source.id, value)}
          />
          <label
            htmlFor={checkboxId}
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              source.isEnabled ? 'cursor-pointer' : 'cursor-not-allowed',
            )}
          >
            {source.name}
          </label>
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
            关闭的源不参与搜索和自动匹配，历史记录仍可直接播放。设置只保存在当前浏览器。
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              已启用 {activeCount} / {subscribed.length} 个源
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(true)}
                disabled={subscribed.length === 0 || activeCount === subscribed.length}
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
                <ul className="grid grid-cols-2 gap-1.5">{visibleEnabled.map(renderSource)}</ul>
                {visibleDisabled.length > 0 && (
                  <div className="mt-4">
                    <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                      订阅已停用
                    </p>
                    <ul className="grid grid-cols-2 gap-1.5">
                      {visibleDisabled.map(renderSource)}
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
