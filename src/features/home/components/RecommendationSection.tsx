import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PosterCard } from '@/components/media/PosterCard';
import { PosterRow } from '@/components/media/PosterRow';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecommendationItem } from '@/lib/types';

interface RecommendationSectionProps {
  label: string;
  items: RecommendationItem[];
  doubanType: 'movie' | 'tv' | 'show';
  loading: boolean;
}

export function RecommendationSection({
  label,
  items,
  doubanType,
  loading,
}: RecommendationSectionProps) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">{label}</h2>
        <Link
          to={`/douban?type=${doubanType}`}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          更多 <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
      {loading || items.length === 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-32 shrink-0 sm:w-44" />
          ))}
        </div>
      ) : (
        <PosterRow>
          {items.map((item, i) => (
            <PosterCard
              key={`${item.id}-${i}`}
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
