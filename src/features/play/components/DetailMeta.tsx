import { Badge } from '@/components/ui/badge';
import { stripDescriptionHtml } from '@/lib/utils';

interface DetailMetaProps {
  title: string;
  year?: string;
  score?: string;
  currentEpisodeTitle?: string;
  typeName?: string;
  area?: string;
  remark?: string;
  sourceName?: string;
  desc?: string;
}

export function DetailMeta({
  title,
  year,
  score,
  currentEpisodeTitle,
  typeName,
  area,
  remark,
  sourceName,
  desc,
}: DetailMetaProps) {
  const cleanDesc = desc ? stripDescriptionHtml(desc) : '';
  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {currentEpisodeTitle && (
        <p className="mt-1.5 text-sm text-muted-foreground">正在播放 · {currentEpisodeTitle}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Same treatment as the poster card's rating badge, which is
            deliberately a hardcoded amber rather than a theme token. */}
        {score && (
          <Badge className="h-auto bg-amber-400 font-bold text-black hover:bg-amber-400">
            {score}
          </Badge>
        )}
        {typeName && <Badge variant="default">{typeName}</Badge>}
        {year && <Badge variant="secondary">{year}</Badge>}
        {area && <Badge variant="secondary">{area}</Badge>}
        {remark && <Badge variant="secondary">{remark}</Badge>}
        {sourceName && <Badge variant="outline">{sourceName}</Badge>}
      </div>

      {cleanDesc && (
        <>
          {/* No uppercase/tracking-wider: both are no-ops for CJK text and the
              tracking fights the global negative letter-spacing. */}
          <div className="mt-5 mb-2 text-xs font-semibold text-muted-foreground">简介</div>
          <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{cleanDesc}</p>
        </>
      )}
    </div>
  );
}
