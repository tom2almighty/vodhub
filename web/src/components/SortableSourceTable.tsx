import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Activity, ArrowUpToLine, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProbeInfo, VideoSource } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface SourceTableRowItem {
  src: VideoSource;
  index: number;
}

interface SortableSourceTableProps {
  rows: SourceTableRowItem[];
  dragDisabled: boolean;
  probingIds: Set<string>;
  onReorder: (activeId: string, overId: string) => void;
  onToggleEnabled: (index: number, enabled: boolean) => void;
  onWeightChange: (index: number, weight: number) => void;
  onPinTop: (index: number) => void;
  onProbe: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

function formatShortUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.host + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return raw;
  }
}

export function ProbeBadge({ probe }: { probe?: ProbeInfo }) {
  if (!probe) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        未检测
      </Badge>
    );
  }
  const ms = typeof probe.latencyMs === 'number' ? ` ${probe.latencyMs}ms` : '';
  if (probe.status === 'ok') {
    return (
      <Badge
        variant="outline"
        className="border-success/30 bg-success/10 text-success"
        title={probe.message}
      >
        正常{ms}
      </Badge>
    );
  }
  if (probe.status === 'fake-search') {
    return (
      <Badge
        variant="outline"
        className="border-warning/30 bg-warning/10 text-warning"
        title={probe.message}
      >
        假搜索{ms}
      </Badge>
    );
  }
  if (probe.status === 'empty') {
    return (
      <Badge
        variant="outline"
        className="border-warning/30 bg-warning/10 text-warning"
        title={probe.message}
      >
        空数据{ms}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" title={probe.message}>
      异常
    </Badge>
  );
}

function WeightCellInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    setDraft(value === 0 ? '' : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-') {
      if (value !== 0) onChange(0);
      setDraft('');
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraft(value === 0 ? '' : String(value));
      return;
    }
    const clamped = Math.max(-999, Math.min(999, parsed));
    if (clamped !== value) onChange(clamped);
    setDraft(clamped === 0 ? '' : String(clamped));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder="0"
      aria-label={`${name} 搜索权重`}
      title="独立搜索权重（正数加权，负数降权，同权重按列表顺序）"
      onChange={(e) => {
        const next = e.target.value;
        if (!/^-?\d*$/.test(next)) return;
        setDraft(next);
        if (next === '') {
          if (value !== 0) onChange(0);
        } else if (next !== '-') {
          const parsed = Number.parseInt(next, 10);
          if (!Number.isNaN(parsed)) {
            const clamped = Math.max(-999, Math.min(999, parsed));
            if (clamped !== value) onChange(clamped);
          }
        }
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(draft);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'h-7 w-16 px-2 text-right font-mono text-xs tabular-nums',
        value > 0 && 'border-primary/40 font-medium text-foreground',
        value < 0 && 'border-warning/40 text-warning',
        value === 0 && 'text-muted-foreground',
      )}
    />
  );
}

function SortableRow({
  item,
  dragDisabled,
  probing,
  onToggleEnabled,
  onWeightChange,
  onPinTop,
  onProbe,
  onEdit,
  onDelete,
}: {
  item: SourceTableRowItem;
  dragDisabled: boolean;
  probing: boolean;
  onToggleEnabled: (index: number, enabled: boolean) => void;
  onWeightChange: (index: number, weight: number) => void;
  onPinTop: (index: number) => void;
  onProbe: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const { src, index } = item;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: src.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        !src.isEnabled && 'bg-muted/25 text-muted-foreground',
        isDragging && 'relative z-20 bg-card shadow-md ring-1 ring-primary/30',
      )}
    >
      <TableCell className="w-16 pr-1 pl-2">
        <div className="flex items-center gap-1">
          <button
            ref={setActivatorNodeRef}
            type="button"
            disabled={dragDisabled}
            aria-label={`拖拽调整 ${src.name} 顺序`}
            title={dragDisabled ? '清空筛选后可拖拽排序' : '按住上下拖拽排序'}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors',
              dragDisabled
                ? 'cursor-not-allowed opacity-35'
                : 'cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing',
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {index + 1}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-14">
        <Switch
          size="sm"
          checked={src.isEnabled}
          aria-label={`默认启用 ${src.name}`}
          onCheckedChange={(checked) => onToggleEnabled(index, checked)}
        />
      </TableCell>

      <TableCell className="max-w-52 whitespace-normal">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{src.name}</span>
          {src.useProxy && (
            <Badge
              variant="outline"
              className="shrink-0 text-muted-foreground"
              title="仅 API 元数据请求走 UPSTREAM_PROXY，播放流始终直连"
            >
              代理
            </Badge>
          )}
        </div>
        <p
          className="mt-0.5 truncate font-mono text-xs text-muted-foreground md:hidden"
          title={`${src.id} · ${src.url}`}
        >
          {formatShortUrl(src.url)}
        </p>
      </TableCell>

      <TableCell className="hidden max-w-64 md:table-cell">
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={`${src.id} · ${src.url}`}
        >
          {formatShortUrl(src.url)}
        </p>
      </TableCell>

      <TableCell className="w-20">
        <WeightCellInput
          name={src.name}
          value={src.weight ?? 0}
          onChange={(next) => onWeightChange(index, next)}
        />
      </TableCell>

      <TableCell className="w-32">
        <ProbeBadge probe={src.probe} />
      </TableCell>

      <TableCell className="w-32 pr-2 text-right">
        <div className="inline-flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={probing}
            onClick={() => onProbe(index)}
            aria-label={`检测 ${src.name}`}
            title="检测搜索能力"
          >
            {probing ? <Spinner className="size-3.5" /> : <Activity className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={index === 0}
            onClick={() => onPinTop(index)}
            aria-label={`置顶 ${src.name}`}
            title="置顶到第 1 位"
          >
            <ArrowUpToLine className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(index)}
            aria-label={`编辑 ${src.name}`}
            title="编辑"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(index)}
            aria-label={`删除 ${src.name}`}
            title="删除"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SortableSourceTable({
  rows,
  dragDisabled,
  probingIds,
  onReorder,
  onToggleEnabled,
  onWeightChange,
  onPinTop,
  onProbe,
  onEdit,
  onDelete,
}: SortableSourceTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 pl-3 text-xs text-muted-foreground">排序</TableHead>
              <TableHead className="w-14 text-xs text-muted-foreground">启用</TableHead>
              <TableHead className="text-xs text-muted-foreground">名称</TableHead>
              <TableHead className="hidden text-xs text-muted-foreground md:table-cell">
                接口地址
              </TableHead>
              <TableHead className="w-20 text-xs text-muted-foreground">权重</TableHead>
              <TableHead className="w-32 text-xs text-muted-foreground">状态</TableHead>
              <TableHead className="w-32 pr-3 text-right text-xs text-muted-foreground">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext items={rows.map((r) => r.src.id)} strategy={verticalListSortingStrategy}>
            <TableBody>
              {rows.map((item) => (
                <SortableRow
                  key={item.src.id}
                  item={item}
                  dragDisabled={dragDisabled}
                  probing={probingIds.has(item.src.id)}
                  onToggleEnabled={onToggleEnabled}
                  onWeightChange={onWeightChange}
                  onPinTop={onPinTop}
                  onProbe={onProbe}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </TableBody>
          </SortableContext>
        </Table>
      </DndContext>
    </div>
  );
}
