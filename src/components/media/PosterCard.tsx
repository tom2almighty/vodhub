import { Layers, Play, Trash2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { createPlaySession, type PlaySessionPayload } from '@/lib/api/sources';
import { deletePlayRecord } from '@/lib/db';
import type { SearchResult } from '@/lib/types';
import { cn, progressPct } from '@/lib/utils';
import { PosterImage } from './PosterImage';

const SESSION_KEY = 'vodhub_play_session';

export type PosterCardVariant = 'douban' | 'search' | 'history';

export interface PosterCardProps {
  variant: PosterCardVariant;
  title: string;
  poster: string;
  year?: string;
  // douban
  doubanId?: number;
  rating?: string;
  doubanType?: 'movie' | 'tv' | 'show' | string;
  // search & history
  source?: string;
  id?: string;
  sourceName?: string;
  sourceNames?: string[];
  episodes?: number;
  query?: string;
  candidates?: SearchResult[];
  // history
  progress?: number;
  totalTime?: number;
  currentEpisode?: number;
  onDelete?: () => void;
}

function PosterCardImpl(props: PosterCardProps) {
  const {
    variant,
    title,
    poster,
    year,
    rating,
    source,
    id,
    sourceName,
    sourceNames,
    episodes,
    query,
    candidates,
    progress = 0,
    totalTime,
    currentEpisode,
    onDelete,
  } = props;

  const navigate = useNavigate();
  const [routing, setRouting] = useState(false);

  const handleClick = useCallback(async () => {
    if (variant === 'douban') {
      const keyword = (title || query || '').trim();
      if (!keyword) return;
      navigate(`/search?q=${encodeURIComponent(keyword)}`);
      return;
    }
    if (routing) return;
    setRouting(true);
    try {
      let payload: PlaySessionPayload;
      if (candidates?.length) {
        payload = {
          mode: 'group',
          title,
          year,
          type: episodes === 1 ? 'movie' : 'tv',
          query: query || title,
          preferredSource: source,
          preferredId: id,
          candidates,
        };
      } else if (source && id) {
        payload = {
          mode: 'direct',
          source,
          id,
          title,
          year,
          type: episodes === 1 ? 'movie' : 'tv',
          query: query || title,
        };
      } else {
        payload = {
          mode: 'search',
          keyword: query || title,
          expectedTitle: title,
          expectedYear: year,
        };
      }
      const data = await createPlaySession(payload);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      navigate('/play');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载播放源失败');
    } finally {
      setRouting(false);
    }
  }, [variant, title, year, query, episodes, source, id, candidates, navigate, routing]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (variant !== 'history' || !source || !id) return;
      try {
        await deletePlayRecord(source, id);
        onDelete?.();
      } catch {
        toast.error('删除失败');
      }
    },
    [variant, source, id, onDelete],
  );

  const ratingNum = rating ? parseFloat(rating) : 0;
  const aggregateCount = sourceNames ? new Set(sourceNames).size : 0;
  const showSource = variant !== 'douban' && !!sourceName;
  const progressDisplay = totalTime !== undefined ? progressPct(progress, totalTime) : progress;

  return (
    <div className="group cursor-pointer" onClick={handleClick}>
      <Card
        className={cn(
          'relative aspect-2/3 overflow-hidden rounded-lg border border-border bg-muted shadow-sm',
          'transition-[transform,box-shadow,border-color] duration-300',
          'group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md',
        )}
      >
        <PosterImage src={poster} alt={title} />

        {/* Bottom legibility gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 via-black/10 to-transparent" />

        {/* Hover overlay with play button */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-white/15">
            <Play className="ml-0.5 h-5 w-5 fill-current" strokeWidth={0} />
          </div>
        </div>

        {routing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {year && year !== 'unknown' && (
          <Badge
            variant="secondary"
            className="absolute left-2 top-2 h-5 bg-black/55 px-1.5 text-xs text-white/85 backdrop-blur-sm hover:bg-black/55"
          >
            {year}
          </Badge>
        )}

        {ratingNum > 0 && (
          <Badge
            className="absolute right-2 top-2 h-5 bg-amber-400 px-1.5 text-xs font-bold text-black hover:bg-amber-400"
            variant="secondary"
          >
            {rating}
          </Badge>
        )}

        {!ratingNum && episodes !== undefined && episodes > 1 && (
          <Badge
            variant="secondary"
            className="absolute right-2 top-2 h-5 bg-black/55 px-1.5 text-xs text-white/85 backdrop-blur-sm hover:bg-black/55"
          >
            {currentEpisode ? `${currentEpisode}/${episodes}` : `${episodes}集`}
          </Badge>
        )}

        {aggregateCount > 1 && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 left-2 h-5 gap-1 bg-black/55 px-1.5 text-xs text-white/85 backdrop-blur-sm hover:bg-black/55"
          >
            <Layers className="h-2.5 w-2.5" strokeWidth={2} />
            {aggregateCount}
          </Badge>
        )}

        {variant === 'history' && (
          <button
            type="button"
            onClick={handleDelete}
            aria-label="移除"
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white/85 opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </Card>

      {variant === 'history' && (
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(100, progressDisplay)}%` }}
          />
        </div>
      )}

      <div className="mt-2.5 space-y-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-primary">
          {title}
        </h3>
        {showSource && <p className="truncate text-xs text-muted-foreground">{sourceName}</p>}
      </div>
    </div>
  );
}

export const PosterCard = memo(PosterCardImpl);
