import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, processImageUrl } from '@/lib/utils';

interface PosterImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function PosterImage({ src, alt, className }: PosterImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = processImageUrl(src);

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {!loaded && !errored && <Skeleton className="absolute inset-0 rounded-none" />}
      {errored ? (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="h-7 w-7 text-muted-foreground/40" strokeWidth={1} />
        </div>
      ) : (
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.dataset.retried) {
              img.dataset.retried = 'true';
              setTimeout(() => {
                img.src = processImageUrl(src);
              }, 1500);
              return;
            }
            setErrored(true);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />
      )}
    </div>
  );
}
