import { ChevronRight, Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterRow } from '@/components/media/PosterRow';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecommendations } from '@/hooks/useDouban';
import { useSite } from '@/hooks/useSite';
import type { DoubanKind, RecommendationItem } from '@/lib/types';

const DISMISS_KEY = 'vodhub_announcement_dismissed';

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
}

function Announcement() {
  const { announcement, announcementTitle } = useSite();
  const [dismissedFor, setDismissedFor] = useState(readDismissed);

  if (!announcement || dismissedFor === announcement) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, announcement);
    } catch {
      /* ignore */
    }
    setDismissedFor(announcement);
  };

  return (
    <div className="relative flex items-start gap-3 rounded-lg border border-border bg-card p-4 pr-11">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        {announcementTitle && (
          <p className="text-sm font-semibold text-foreground">{announcementTitle}</p>
        )}
        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
          {announcement}
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="关闭公告"
        className="absolute right-3 top-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function RecommendationSection({
  label,
  items,
  doubanType,
  loading,
}: {
  label: string;
  items: RecommendationItem[];
  doubanType: DoubanKind;
  loading: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">{label}</h2>
        <Link
          to={`/douban?kind=${doubanType}`}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          更多 <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-2/3 w-32 shrink-0 sm:w-44" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty className="border border-border bg-card py-12">
          <EmptyHeader>
            <EmptyTitle>暂无内容</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <PosterRow label={label}>
          {items.map((item) => (
            <PosterCard
              key={item.id}
              variant="douban"
              title={item.title}
              poster={item.poster}
              year={item.year}
              rating={item.rating}
              doubanId={Number(item.id)}
              doubanType={doubanType}
            />
          ))}
        </PosterRow>
      )}
    </section>
  );
}

export default function HomePage() {
  const recQuery = useRecommendations();
  const movies = recQuery.data?.movies ?? [];
  const tvShows = recQuery.data?.tvShows ?? [];
  const varietyShows = recQuery.data?.varietyShows ?? [];
  const recLoading = recQuery.isLoading;

  return (
    <div className="app-page space-y-10">
      <Announcement />
      <RecommendationSection
        label="热门电影"
        items={movies}
        doubanType="movie"
        loading={recLoading && movies.length === 0}
      />
      <RecommendationSection
        label="热门剧集"
        items={tvShows}
        doubanType="tv"
        loading={recLoading && tvShows.length === 0}
      />
      <RecommendationSection
        label="热门综艺"
        items={varietyShows}
        doubanType="show"
        loading={recLoading && varietyShows.length === 0}
      />
    </div>
  );
}
