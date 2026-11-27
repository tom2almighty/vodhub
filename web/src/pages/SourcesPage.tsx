import { arrayMove } from '@dnd-kit/sortable';
import {
  Activity,
  Download,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SortableSourceTable } from '@/components/SortableSourceTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAdminSources } from '@/hooks/useSources';
import {
  importAdminSources,
  probeAdminSource,
  saveAdminSources,
  syncAdminSources,
} from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { VideoSource } from '@/lib/types';

type StatusFilter = 'all' | 'enabled' | 'disabled' | 'ok' | 'fake-search' | 'error' | 'unchecked';
type SyncMode = 'merge' | 'append' | 'replace';
type AddTab = 'manual' | 'sync' | 'import';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '全部状态',
  enabled: '默认启用',
  disabled: '默认关闭',
  ok: '搜索正常',
  'fake-search': '不支持搜索',
  error: '异常 / 空数据',
  unchecked: '未检测',
};

const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  merge: '增量合并（保留本地开关）',
  append: '仅追加新源',
  replace: '完全覆盖',
};

interface SourceFormState {
  id: string;
  name: string;
  url: string;
  detailUrl: string;
  timeout: string;
  retry: string;
  weight: string;
  isEnabled: boolean;
  useProxy: boolean;
}

const EMPTY_FORM: SourceFormState = {
  id: '',
  name: '',
  url: '',
  detailUrl: '',
  timeout: '',
  retry: '',
  weight: '',
  isEnabled: true,
  useProxy: false,
};

export default function SourcesPage() {
  const { data, isLoading, isError, refetch } = useAdminSources();
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter & probe state
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [probingIds, setProbingIds] = useState<Set<string>>(new Set());
  const [batchProbe, setBatchProbe] = useState<{ done: number; total: number } | null>(null);

  // Unified Add/Sync/Import dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>('manual');
  const [addForm, setAddForm] = useState<SourceFormState>(EMPTY_FORM);
  const [syncPreset, setSyncPreset] = useState('jin18');
  const [customUrl, setCustomUrl] = useState('');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [syncing, setSyncing] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // Edit single source dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [editForm, setEditForm] = useState<SourceFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!data) return;
    setSources(data.sources);
    setCustomUrl(data.customUpstreamUrl || '');
    if (
      data.presets.length > 0 &&
      !data.presets.some((p) => p.key === syncPreset) &&
      syncPreset !== 'custom'
    ) {
      setSyncPreset(data.presets[0].key);
    }
    setDirty(false);
  }, [data, syncPreset]);

  const invalidateSources = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSources }),
    ]);
  };

  const stats = useMemo(() => {
    const total = sources.length;
    const enabled = sources.filter((s) => s.isEnabled).length;
    const bad = sources.filter((s) =>
      ['fake-search', 'error', 'empty'].includes(s.probe?.status || ''),
    ).length;
    return { total, enabled, disabled: total - enabled, bad };
  }, [sources]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return sources
      .map((src, index) => ({ src, index }))
      .filter(({ src }) => {
        if (q && !`${src.name} ${src.id} ${src.url}`.toLowerCase().includes(q)) return false;
        if (statusFilter === 'enabled') return src.isEnabled;
        if (statusFilter === 'disabled') return !src.isEnabled;
        if (statusFilter === 'ok') return src.probe?.status === 'ok';
        if (statusFilter === 'fake-search') return src.probe?.status === 'fake-search';
        if (statusFilter === 'error') {
          return src.probe?.status === 'error' || src.probe?.status === 'empty';
        }
        if (statusFilter === 'unchecked') return !src.probe?.status;
        return true;
      });
  }, [sources, keyword, statusFilter]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveAdminSources(sources, customUrl);
      setSources(saved.sources);
      setDirty(false);
      await invalidateSources();
      toast.success('视频源配置已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (syncPreset === 'custom' && !customUrl.trim()) {
      toast.error('请填写自定义上游 JSON 地址');
      return;
    }
    if (
      syncMode === 'replace' &&
      !window.confirm('完全覆盖会丢失当前自定义源和开关状态，确定继续？')
    ) {
      return;
    }
    setSyncing(true);
    try {
      const res = await syncAdminSources(
        syncPreset === 'custom'
          ? { url: customUrl.trim(), mode: syncMode }
          : { preset: syncPreset, mode: syncMode },
      );
      setSources(res.sources);
      setDirty(false);
      setAddOpen(false);
      await invalidateSources();
      toast.success(`同步完成：新增 ${res.added} 个，更新 ${res.updated} 个`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上游同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const probeOne = async (index: number) => {
    const src = sources[index];
    if (!src) return;
    setProbingIds((prev) => new Set(prev).add(src.id));
    try {
      const probe = await probeAdminSource(src);
      setSources((prev) => prev.map((item) => (item.id === src.id ? { ...item, probe } : item)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '检测失败');
    } finally {
      setProbingIds((prev) => {
        const next = new Set(prev);
        next.delete(src.id);
        return next;
      });
    }
  };

  const handleProbeAll = async () => {
    if (batchProbe || filteredRows.length === 0) return;
    const targets = filteredRows.map((r) => r.src);
    setBatchProbe({ done: 0, total: targets.length });
    const queue = [...targets];
    let done = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const src = queue.shift();
        if (!src) break;
        setProbingIds((prev) => new Set(prev).add(src.id));
        try {
          const probe = await probeAdminSource(src);
          setSources((prev) =>
            prev.map((item) => (item.id === src.id ? { ...item, probe } : item)),
          );
        } catch {
          /* continue batch */
        } finally {
          setProbingIds((prev) => {
            const next = new Set(prev);
            next.delete(src.id);
            return next;
          });
        }
        done++;
        setBatchProbe({ done, total: targets.length });
      }
    };

    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));
    setBatchProbe(null);
    await invalidateSources();
    toast.success(`已完成 ${targets.length} 个视频源的搜索能力检测`);
  };

  const handleDisableBad = () => {
    let count = 0;
    const next = sources.map((s) => {
      if (s.isEnabled && ['fake-search', 'error', 'empty'].includes(s.probe?.status || '')) {
        count++;
        return { ...s, isEnabled: false };
      }
      return s;
    });
    if (count === 0) {
      toast.info('当前没有需要关闭的假搜索或异常源');
      return;
    }
    setSources(next);
    setDirty(true);
    toast.success(`已关闭 ${count} 个异常源，点击“保存更改”生效`);
  };

  const toggleAll = (enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, isEnabled: enabled })));
    setDirty(true);
  };

  const buildSourceFromForm = (f: SourceFormState): VideoSource | null => {
    const id = f.id.trim();
    const name = f.name.trim();
    const url = f.url.trim();
    if (!id || !name || !url) {
      toast.error('请填写完整的 ID、名称和 API 地址');
      return null;
    }
    const next: VideoSource = {
      id,
      name,
      url,
      isEnabled: f.isEnabled,
      useProxy: f.useProxy || undefined,
    };
    if (f.detailUrl.trim()) next.detailUrl = f.detailUrl.trim();
    if (f.timeout.trim() && Number(f.timeout) > 0) next.timeout = Math.round(Number(f.timeout));
    if (f.retry.trim() !== '' && Number(f.retry) >= 0) next.retry = Math.round(Number(f.retry));
    if (f.weight.trim() !== '') {
      const parsedWeight = Number.parseInt(f.weight.trim(), 10);
      if (!Number.isNaN(parsedWeight) && parsedWeight !== 0) {
        next.weight = Math.max(-999, Math.min(999, parsedWeight));
      }
    }
    return next;
  };

  const handleAddManual = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = buildSourceFromForm(addForm);
    if (!next) return;
    if (sources.some((s) => s.id === next.id)) {
      toast.error(`ID 已存在：${next.id}`);
      return;
    }
    setSources((prev) => [next, ...prev]);
    setAddForm(EMPTY_FORM);
    setDirty(true);
    setAddOpen(false);
    toast.success('已添加到列表，请保存更改');
  };

  const openEditor = (index: number) => {
    const s = sources[index];
    if (!s) return;
    setEditingIndex(index);
    setEditForm({
      id: s.id,
      name: s.name,
      url: s.url,
      detailUrl: s.detailUrl || '',
      timeout: s.timeout ? String(s.timeout) : '',
      retry: typeof s.retry === 'number' ? String(s.retry) : '',
      weight: s.weight ? String(s.weight) : '',
      isEnabled: s.isEnabled,
      useProxy: Boolean(s.useProxy),
    });
    setEditOpen(true);
  };

  const handleSaveEdit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = buildSourceFromForm(editForm);
    if (!next || editingIndex < 0) return;
    next.probe = sources[editingIndex]?.probe;
    setSources((prev) => prev.map((item, idx) => (idx === editingIndex ? next : item)));
    setDirty(true);
    setEditOpen(false);
  };

  const handleImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      toast.error('JSON 格式无效');
      return;
    }
    setImporting(true);
    try {
      const res = await importAdminSources(parsed, 'merge');
      setSources(res.sources);
      setDirty(false);
      setAddOpen(false);
      setImportText('');
      await invalidateSources();
      toast.success(`导入完成：新增 ${res.added} 个，更新 ${res.updated} 个`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const reorderByIds = (activeId: string, overId: string) => {
    setSources((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === activeId);
      const newIndex = prev.findIndex((s) => s.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  };

  const pinToTop = (index: number) => {
    if (index <= 0 || index >= sources.length) return;
    setSources((prev) => arrayMove(prev, index, 0));
    setDirty(true);
  };

  const toggleEnabled = (index: number, enabled: boolean) => {
    setSources((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, isEnabled: enabled } : item)),
    );
    setDirty(true);
  };

  const updateWeight = (index: number, weight: number) => {
    setSources((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, weight: weight === 0 ? undefined : weight } : item,
      ),
    );
    setDirty(true);
  };

  const deleteRow = (index: number) => {
    const target = sources[index];
    if (!target || !window.confirm(`确定删除视频源「${target.name}」？`)) return;
    setSources((prev) => prev.filter((_, idx) => idx !== index));
    setDirty(true);
  };

  const handleExport = () => {
    const clean = sources.map(({ probe: _probe, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vodhub-sources.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const presets = data?.presets ?? [];
  const selectedPresetLabel =
    syncPreset === 'custom'
      ? '自定义 URL'
      : presets.find((p) => p.key === syncPreset)?.label || syncPreset;

  return (
    <div className="app-page mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">视频源管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            拖拽调整列表顺序，搜索结果按独立权重优先、同权重按顺序兜底。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddTab('manual');
              setAddForm(EMPTY_FORM);
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加 / 导入
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? <Spinner className="size-3.5" /> : <Save className="h-4 w-4" />}
            {dirty ? '保存更改' : '已保存'}
          </Button>
        </div>
      </div>

      {/* Compact summary strip */}
      <div className="grid grid-cols-4 divide-x divide-border rounded-lg border border-border bg-card">
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">总数</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{stats.total}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">默认启用</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{stats.enabled}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">默认关闭</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{stats.disabled}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">异常 / 假搜索</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{stats.bad}</p>
        </div>
      </div>

      {/* Filter & batch actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索名称、ID 或接口域名..."
            className="h-8 pl-8 text-sm"
            aria-label="筛选视频源"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v as StatusFilter);
          }}
        >
          <SelectTrigger className="w-36" aria-label="按状态筛选">
            <SelectValue>{STATUS_LABELS[statusFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(STATUS_LABELS) as Array<[StatusFilter, string]>).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          disabled={!!batchProbe || filteredRows.length === 0}
          onClick={handleProbeAll}
        >
          {batchProbe ? <Spinner className="size-3.5" /> : <Activity className="h-3.5 w-3.5" />}
          批量检测
        </Button>

        <Button variant="outline" size="sm" disabled={stats.bad === 0} onClick={handleDisableBad}>
          <ShieldAlert className="h-3.5 w-3.5" />
          关闭异常
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={sources.length === 0}
          onClick={() => toggleAll(true)}
        >
          全开
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={sources.length === 0}
          onClick={() => toggleAll(false)}
        >
          全关
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={sources.length === 0}
          onClick={handleExport}
          title="导出 JSON"
        >
          <Download className="h-3.5 w-3.5" />
          导出
        </Button>
      </div>

      {batchProbe && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <Spinner className="size-3.5" />
          <span className="text-xs tabular-nums text-muted-foreground">
            正在检测搜索能力 {batchProbe.done}/{batchProbe.total}
          </span>
          <Progress
            value={batchProbe.total > 0 ? (batchProbe.done / batchProbe.total) * 100 : 0}
            className="h-1.5 flex-1"
          />
        </div>
      )}

      {/* Sortable compact table */}
      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Empty className="border border-border bg-card py-14">
          <EmptyHeader>
            <EmptyTitle>视频源加载失败</EmptyTitle>
            <EmptyDescription>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                重试
              </Button>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filteredRows.length === 0 ? (
        <Empty className="border border-border bg-card py-14">
          <EmptyHeader>
            <EmptyTitle>{sources.length === 0 ? '暂无视频源' : '没有匹配的源'}</EmptyTitle>
            <EmptyDescription>
              {sources.length === 0
                ? '点击右上角“添加 / 导入”可快速从上游同步或手动新增'
                : '换个筛选条件试试'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <SortableSourceTable
          rows={filteredRows}
          dragDisabled={keyword.trim() !== '' || statusFilter !== 'all'}
          probingIds={probingIds}
          onReorder={reorderByIds}
          onToggleEnabled={toggleEnabled}
          onWeightChange={updateWeight}
          onPinTop={pinToTop}
          onProbe={probeOne}
          onEdit={openEditor}
          onDelete={deleteRow}
        />
      )}

      {/* Add / Sync / Import Dialog with fixed tab height */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加与导入视频源</DialogTitle>
            <DialogDescription>
              支持手动新增单源、从上游一键同步或粘贴 JSON 批量导入。
            </DialogDescription>
          </DialogHeader>

          <Tabs value={addTab} onValueChange={(v) => setAddTab(v as AddTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="manual">手动添加</TabsTrigger>
              <TabsTrigger value="sync">上游同步</TabsTrigger>
              <TabsTrigger value="import">JSON 导入</TabsTrigger>
            </TabsList>

            {/* Fixed-height body prevents layout jump when switching tabs */}
            <div className="mt-3 h-96 overflow-hidden">
              <TabsContent value="manual" className="m-0 flex h-full flex-col overflow-hidden">
                <form
                  onSubmit={handleAddManual}
                  className="flex h-full min-h-0 flex-col overflow-hidden"
                >
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-0.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="add-id">ID（唯一标识）</Label>
                        <Input
                          id="add-id"
                          required
                          value={addForm.id}
                          onChange={(e) => setAddForm((f) => ({ ...f, id: e.target.value }))}
                          placeholder="例如 dyttzy"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="add-name">名称</Label>
                        <Input
                          id="add-name"
                          required
                          value={addForm.name}
                          onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="例如 电影天堂"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="add-url">API 地址 (url)</Label>
                      <Input
                        id="add-url"
                        type="url"
                        required
                        value={addForm.url}
                        onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
                        placeholder="https://example.com/api.php/provide/vod"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="add-detail">详情地址 (detailUrl，可选)</Label>
                      <Input
                        id="add-detail"
                        type="url"
                        value={addForm.detailUrl}
                        onChange={(e) => setAddForm((f) => ({ ...f, detailUrl: e.target.value }))}
                        placeholder="留空则使用主 API 地址"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="add-weight">搜索权重</Label>
                        <Input
                          id="add-weight"
                          type="number"
                          min={-999}
                          max={999}
                          value={addForm.weight}
                          onChange={(e) => setAddForm((f) => ({ ...f, weight: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="add-timeout">超时 ms</Label>
                        <Input
                          id="add-timeout"
                          type="number"
                          min={1000}
                          step={500}
                          value={addForm.timeout}
                          onChange={(e) => setAddForm((f) => ({ ...f, timeout: e.target.value }))}
                          placeholder="10000"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="add-retry">重试次数</Label>
                        <Input
                          id="add-retry"
                          type="number"
                          min={0}
                          max={5}
                          value={addForm.retry}
                          onChange={(e) => setAddForm((f) => ({ ...f, retry: e.target.value }))}
                          placeholder="1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <Label htmlFor="add-enabled" className="cursor-pointer text-sm">
                          默认启用
                        </Label>
                        <Switch
                          id="add-enabled"
                          size="sm"
                          checked={addForm.isEnabled}
                          onCheckedChange={(checked) =>
                            setAddForm((f) => ({ ...f, isEnabled: checked }))
                          }
                        />
                      </div>
                      <div
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                        title={
                          data?.hasUpstreamProxy
                            ? '仅搜索与详情 API 请求走 UPSTREAM_PROXY，视频播放仍由浏览器直连'
                            : '需在环境变量配置 UPSTREAM_PROXY 后生效'
                        }
                      >
                        <Label htmlFor="add-proxy" className="cursor-pointer text-sm">
                          API 走代理
                        </Label>
                        <Switch
                          id="add-proxy"
                          size="sm"
                          checked={addForm.useProxy}
                          onCheckedChange={(checked) =>
                            setAddForm((f) => ({ ...f, useProxy: checked }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border pt-3">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                      取消
                    </Button>
                    <Button type="submit">添加到列表</Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="sync" className="m-0 flex h-full flex-col overflow-hidden">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-0.5">
                  <div className="space-y-1.5">
                    <Label>上游配置源</Label>
                    <Select
                      value={syncPreset}
                      onValueChange={(v) => {
                        if (v) setSyncPreset(v);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{selectedPresetLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {presets.map((p) => (
                          <SelectItem key={p.key} value={p.key}>
                            {p.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">自定义 URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="sync-custom">自定义上游 JSON 地址</Label>
                    <Input
                      id="sync-custom"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      disabled={syncPreset !== 'custom'}
                      placeholder="https://example.com/sources.json"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>合并策略</Label>
                    <Select
                      value={syncMode}
                      onValueChange={(v) => {
                        if (v) setSyncMode(v as SyncMode);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{SYNC_MODE_LABELS[syncMode]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(SYNC_MODE_LABELS) as Array<[SyncMode, string]>).map(
                          ([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    支持 OuonNkiTV 数组格式和 LunaTV api_site
                    对象格式，增量合并会保留已有开关与排序。
                  </p>
                </div>

                <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border pt-3">
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                    取消
                  </Button>
                  <Button disabled={syncing} onClick={handleSync}>
                    {syncing ? <Spinner className="size-3.5" /> : <RefreshCw className="h-4 w-4" />}
                    开始同步
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="import" className="m-0 flex h-full flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-0.5 py-0.5">
                  <Label htmlFor="import-json" className="shrink-0">
                    JSON 内容
                  </Label>
                  <Textarea
                    id="import-json"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='[{"id":"demo","name":"示例","url":"https://example.com/api.php/provide/vod","isEnabled":true}]'
                    className="min-h-0 flex-1 resize-none overflow-y-auto field-sizing-fixed font-mono text-xs"
                  />
                </div>
                <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border pt-3">
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                    取消
                  </Button>
                  <Button disabled={importing || !importText.trim()} onClick={handleImport}>
                    {importing ? <Spinner className="size-3.5" /> : <Upload className="h-4 w-4" />}
                    导入并合并
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit single source Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑视频源</DialogTitle>
            <DialogDescription>修改完成后点击页面右上角「保存更改」生效。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-id">ID（不可修改）</Label>
                <Input id="edit-id" disabled value={editForm.id} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">名称</Label>
                <Input
                  id="edit-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-url">API 地址 (url)</Label>
              <Input
                id="edit-url"
                type="url"
                required
                value={editForm.url}
                onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-detail">详情地址 (detailUrl，可选)</Label>
              <Input
                id="edit-detail"
                type="url"
                value={editForm.detailUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, detailUrl: e.target.value }))}
                placeholder="留空则使用主 API 地址"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-weight">搜索权重</Label>
                <Input
                  id="edit-weight"
                  type="number"
                  min={-999}
                  max={999}
                  value={editForm.weight}
                  onChange={(e) => setEditForm((f) => ({ ...f, weight: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-timeout">超时 ms</Label>
                <Input
                  id="edit-timeout"
                  type="number"
                  min={1000}
                  step={500}
                  value={editForm.timeout}
                  onChange={(e) => setEditForm((f) => ({ ...f, timeout: e.target.value }))}
                  placeholder="10000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-retry">重试次数</Label>
                <Input
                  id="edit-retry"
                  type="number"
                  min={0}
                  max={5}
                  value={editForm.retry}
                  onChange={(e) => setEditForm((f) => ({ ...f, retry: e.target.value }))}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="edit-enabled" className="cursor-pointer text-sm">
                  默认启用
                </Label>
                <Switch
                  id="edit-enabled"
                  size="sm"
                  checked={editForm.isEnabled}
                  onCheckedChange={(checked) => setEditForm((f) => ({ ...f, isEnabled: checked }))}
                />
              </div>
              <div
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                title={
                  data?.hasUpstreamProxy
                    ? '仅搜索与详情 API 请求走 UPSTREAM_PROXY，视频播放仍由浏览器直连'
                    : '需在环境变量配置 UPSTREAM_PROXY 后生效'
                }
              >
                <Label htmlFor="edit-proxy" className="cursor-pointer text-sm">
                  API 走代理
                </Label>
                <Switch
                  id="edit-proxy"
                  size="sm"
                  checked={editForm.useProxy}
                  onCheckedChange={(checked) => setEditForm((f) => ({ ...f, useProxy: checked }))}
                />
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button type="submit">确定</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
