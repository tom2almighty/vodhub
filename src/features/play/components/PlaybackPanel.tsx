import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailMeta } from './DetailMeta';

interface SourceLike {
  source: string;
  source_name: string;
  id: string;
}

interface MediaInfo {
  title: string;
  year?: string;
  currentEpisodeTitle?: string;
  typeName?: string;
  area?: string;
  remark?: string;
  sourceName?: string;
  desc?: string;
}

interface PlaybackPanelProps {
  totalEpisodes: number;
  episodesTitles: string[];
  episodeValue: number; // 1-based
  onEpisodeChange: (ep: number) => void;
  currentSource: string;
  currentId: string;
  availableSources: SourceLike[];
  onSourceChange: (source: string, id: string, title: string) => Promise<void>;
  info: MediaInfo;
}

export function PlaybackPanel({
  totalEpisodes,
  episodesTitles,
  episodeValue,
  onEpisodeChange,
  currentSource,
  currentId,
  availableSources,
  onSourceChange,
  info,
}: PlaybackPanelProps) {
  const currentKey = `${currentSource}+${currentId}`;
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // Clear pending state once parent's current source/id catches up
  useEffect(() => {
    if (pendingKey && pendingKey === currentKey) setPendingKey(null);
  }, [pendingKey, currentKey]);

  const activeKey = pendingKey ?? currentKey;
  // While one switch is in flight every button is disabled: allowing a second
  // click used to leave two requests racing for the same piece of state.
  const isSwitching = pendingKey !== null;

  const handleSourceClick = async (src: SourceLike) => {
    const key = `${src.source}+${src.id}`;
    if (key === currentKey) return;
    setPendingKey(key);
    try {
      await onSourceChange(src.source, src.id, src.source_name);
    } catch {
      setPendingKey(null);
    }
  };

  return (
    // No h-full: the panel is content-sized and its wrapper caps the height, so
    // flex-shrink (with min-h-0) is what lets a long episode list scroll inside
    // the card instead of stretching it.
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <Tabs defaultValue="episodes" className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border p-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="episodes">
              选集{totalEpisodes > 0 && ` (${totalEpisodes})`}
            </TabsTrigger>
            <TabsTrigger value="sources">
              换源{availableSources.length > 0 && ` (${availableSources.length})`}
            </TabsTrigger>
            <TabsTrigger value="info">信息</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="episodes" className="m-0 flex-1 overflow-hidden">
          {totalEpisodes > 0 ? (
            <ScrollArea className="h-full">
              <div className="grid grid-cols-5 gap-1.5 p-3 sm:grid-cols-6 lg:grid-cols-5">
                {Array.from({ length: totalEpisodes }, (_, i) => {
                  const active = episodeValue === i + 1;
                  const label = episodesTitles[i] || `${i + 1}`;
                  return (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'secondary'}
                      onClick={() => onEpisodeChange(i + 1)}
                      title={label}
                      className="h-9 min-w-0 px-1 text-xs tabular-nums"
                    >
                      <span className="block truncate">{label}</span>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">暂无选集</div>
          )}
        </TabsContent>

        <TabsContent value="sources" className="m-0 flex-1 overflow-hidden">
          {availableSources.length > 0 ? (
            <ScrollArea className="h-full">
              <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3 lg:grid-cols-3">
                {availableSources.map((src) => {
                  const key = `${src.source}+${src.id}`;
                  const isActive = activeKey === key;
                  const isLoading = pendingKey === key;
                  return (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'secondary'}
                      onClick={() => handleSourceClick(src)}
                      disabled={isSwitching}
                      title={src.source_name}
                      className="h-10 min-w-0 px-2 text-xs"
                    >
                      {isLoading ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                      ) : (
                        <span className="block truncate">{src.source_name}</span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">无其他可用源</div>
          )}
        </TabsContent>

        <TabsContent value="info" className="m-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <DetailMeta {...info} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
