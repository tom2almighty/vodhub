import '@videojs/react/i18n/locales/zh-CN/register';
import '@videojs/react/video/skin.css';
import { resolveAdapterType } from '@videojs/react';
import { I18nProvider } from '@videojs/react/i18n';
import { Video, VideoSkin, VideoPlayer as VjsVideoPlayer } from '@videojs/react/video';
import type * as React from 'react';
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { processImageUrl } from '@/lib/utils';

const HlsJsVideo = lazy(() =>
  import('@videojs/react/media/hlsjs-video').then((m) => ({ default: m.HlsJsVideo })),
);

const SKIN_STYLE = {
  '--media-border-radius': '0px',
  '--media-border-color': 'transparent',
  '--media-font-family': 'var(--font-sans)',
} as React.CSSProperties;

const DEFAULT_VOLUME = 0.7;

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  startTime?: number;
  title?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  onCanPlay?: (duration: number) => void;
  onPause?: () => void;
  onError?: (err: unknown) => void;
}

function isHlsSource(src: string): boolean {
  return resolveAdapterType(src) === 'hls' || /\.m3u8(?:$|[?#&])/i.test(src);
}

export function VideoPlayer({
  src,
  poster,
  startTime,
  title,
  onTimeUpdate,
  onEnded,
  onCanPlay,
  onPause,
  onError,
}: VideoPlayerProps) {
  const startTimeRef = useRef(startTime ?? 0);
  const resumedRef = useRef(false);
  const volumeInitRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = startTime ?? 0;
  }, [startTime]);

  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el || volumeInitRef.current) return;
    el.volume = DEFAULT_VOLUME;
    volumeInitRef.current = true;
  }, []);

  const handleCanPlay = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      if (!resumedRef.current) {
        resumedRef.current = true;
        const target = startTimeRef.current;
        if (target > 5) {
          const duration = video.duration;
          if (!Number.isFinite(duration) || duration <= 0 || target < duration - 2) {
            try {
              video.currentTime = target;
            } catch {
              /* ignore */
            }
          }
        }
      }
      onCanPlay?.(video.duration);
    },
    [onCanPlay],
  );

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      onTimeUpdate?.(e.currentTarget.currentTime);
    },
    [onTimeUpdate],
  );

  const handlePause = useCallback(() => {
    onPause?.();
  }, [onPause]);

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      onError?.(e.currentTarget.error ?? e);
    },
    [onError],
  );

  const posterUrl = poster ? processImageUrl(poster) : '';
  const hls = isHlsSource(src);

  const mediaProps = {
    ref: attachVideoRef,
    src,
    autoPlay: true,
    playsInline: true,
    onCanPlay: handleCanPlay,
    onTimeUpdate: handleTimeUpdate,
    onPause: handlePause,
    onEnded: handleEnded,
    onError: handleError,
  };

  return (
    <I18nProvider locale="zh-CN">
      <VjsVideoPlayer title={title} poster={posterUrl || undefined}>
        <VideoSkin
          className="h-full w-full"
          style={SKIN_STYLE}
          renderPoster={(props, state) =>
            state.src ? (
              <div className="relative h-full w-full overflow-hidden bg-foreground dark:bg-background">
                <img
                  src={state.src}
                  alt=""
                  aria-hidden
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                  className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                />
                <div className="absolute inset-0 bg-foreground/30 dark:bg-background/30" />
                <img
                  {...props}
                  alt={title ?? ''}
                  referrerPolicy="no-referrer"
                  className="relative h-full w-full object-contain"
                />
              </div>
            ) : null
          }
        >
          {hls ? (
            <Suspense fallback={null}>
              <HlsJsVideo {...mediaProps} />
            </Suspense>
          ) : (
            <Video {...mediaProps} />
          )}
        </VideoSkin>
      </VjsVideoPlayer>
    </I18nProvider>
  );
}
