import { ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, processImageUrl } from '@/lib/utils';

const RETRY_DELAY_MS = 1500;

interface PosterImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function PosterImage({ src, alt, className }: PosterImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = processImageUrl(src);

  // A reused DOM node keeps its state when only `src` changes, so a card whose
  // poster updates would otherwise stay stuck on the skeleton or the error icon.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the resolved URL changes
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    setRetryToken(0);
  }, [url]);

  // The retry timer used to outlive the component and fire against a detached
  // image element.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleError = () => {
    // One retry: a cold upstream fetch through the image proxy can fail once.
    if (retryToken === 0) {
      timerRef.current = setTimeout(() => setRetryToken(1), RETRY_DELAY_MS);
      return;
    }
    setErrored(true);
  };

  // Retry through a changed URL so the browser actually refetches; the proxy
  // ignores the extra param.
  const displayUrl =
    retryToken > 0 ? `${url}${url.includes('?') ? '&' : '?'}retry=${retryToken}` : url;

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {!loaded && !errored && <Skeleton className="absolute inset-0 rounded-none" />}
      {errored ? (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="h-7 w-7 text-muted-foreground/40" strokeWidth={1} />
        </div>
      ) : (
        <img
          src={displayUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />
      )}
    </div>
  );
}
