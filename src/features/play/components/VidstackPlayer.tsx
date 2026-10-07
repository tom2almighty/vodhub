import {
  isHLSProvider,
  type MediaCanPlayDetail,
  MediaPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  type MediaProviderAdapter,
  type MediaTimeUpdateEventDetail,
} from '@vidstack/react';
import {
  type DefaultLayoutTranslations,
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { processImageUrl } from '@/lib/utils';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

const ZH_CN: DefaultLayoutTranslations = {
  'Caption Styles': '字幕样式',
  'Captions look like this': '字幕显示效果如下',
  'Closed-Captions Off': '已关闭字幕',
  'Closed-Captions On': '已开启字幕',
  'Display Background': '显示背景',
  'Enter Fullscreen': '进入全屏',
  'Enter PiP': '进入画中画',
  'Exit Fullscreen': '退出全屏',
  'Exit PiP': '退出画中画',
  'Google Cast': 'Google 投屏',
  'Keyboard Animations': '键盘动画',
  'Seek Backward': '后退',
  'Seek Forward': '快进',
  'Skip To Live': '跳到直播',
  'Text Background': '文字背景',
  Accessibility: '辅助功能',
  AirPlay: 'AirPlay 投屏',
  Announcements: '播报',
  Audio: '音轨',
  Auto: '自动',
  Boost: '音量增强',
  Captions: '字幕',
  Chapters: '章节',
  Color: '颜色',
  Connected: '已连接',
  Connecting: '连接中',
  Continue: '继续播放',
  Default: '默认',
  Disabled: '已禁用',
  Disconnected: '已断开',
  Download: '下载',
  Family: '字体',
  Font: '字形',
  Fullscreen: '全屏',
  LIVE: '直播',
  Loop: '循环',
  Mute: '静音',
  Normal: '标准',
  Off: '关闭',
  Opacity: '不透明度',
  Pause: '暂停',
  PiP: '画中画',
  Play: '播放',
  Playback: '播放',
  Quality: '画质',
  Replay: '重新播放',
  Reset: '重置',
  Seek: '进度',
  Settings: '设置',
  Shadow: '阴影',
  Size: '大小',
  Speed: '倍速',
  Text: '文字',
  Track: '轨道',
  Unmute: '取消静音',
  Volume: '音量',
};

export interface VidstackPlayerProps {
  src: string;
  poster?: string;
  startTime?: number;
  title?: string;
  mirror?: boolean;
  aspectRatio?: string;
  onTimeUpdate?: (detail: MediaTimeUpdateEventDetail) => void;
  onEnded?: () => void;
  onCanPlay?: (detail: MediaCanPlayDetail) => void;
  onPause?: () => void;
  onError?: (err: unknown) => void;
}

export function VidstackPlayer({
  src,
  poster,
  startTime,
  title,
  mirror,
  aspectRatio,
  onTimeUpdate,
  onEnded,
  onCanPlay,
  onPause,
  onError,
}: VidstackPlayerProps) {
  const ref = useRef<MediaPlayerInstance>(null);
  const startTimeRef = useRef(startTime ?? 0);
  // Shown while the player is loading/buffering; hidden once playback begins.
  // The player remounts on src change (PlayPage keys it), resetting this.
  const [posterVisible, setPosterVisible] = useState(true);

  // Keep the latest startTime so canplay handler can use it
  useEffect(() => {
    startTimeRef.current = startTime ?? 0;
  }, [startTime]);

  // Apply mirror transform on the underlying <video> element
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const video = player.el?.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.style.transform = mirror ? 'scaleX(-1)' : '';
    }
  }, [mirror]);

  // Use the bundled hls.js instead of letting vidstack fetch it from a CDN.
  const handleProviderChange = (provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      provider.library = Hls;
    }
  };

  const posterUrl = poster ? processImageUrl(poster) : '';

  return (
    <MediaPlayer
      ref={ref}
      src={src}
      title={title}
      autoPlay
      playsInline
      crossOrigin
      volume={0.7}
      aspectRatio={aspectRatio}
      onProviderChange={handleProviderChange}
      onCanPlay={(detail) => {
        const target = startTimeRef.current;
        if (target > 5) {
          const duration = ref.current?.duration ?? 0;
          if (!duration || target < duration - 2) {
            try {
              if (ref.current) ref.current.currentTime = target;
            } catch {
              /* ignore */
            }
          }
        }
        onCanPlay?.(detail);
      }}
      onPlaying={() => setPosterVisible(false)}
      onTimeUpdate={(detail) => {
        onTimeUpdate?.(detail);
      }}
      onEnded={() => onEnded?.()}
      onPause={() => onPause?.()}
      onError={(err) => onError?.(err)}
      className="h-full w-full"
    >
      <MediaProvider>
        {/* Loading poster: blurred backdrop fills the 16:9 frame, the full */}
        {/* cover sits centered on top (contain). Falls back to the title.   */}
        {posterUrl ? (
          <div
            data-visible={posterVisible}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-black transition-opacity duration-300 data-[visible=false]:opacity-0"
          >
            <img
              src={posterUrl}
              alt=""
              aria-hidden
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            />
            <div className="absolute inset-0 bg-black/30" />
            <img
              src={posterUrl}
              alt={title ?? ''}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : (
          <div
            data-visible={posterVisible}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-background px-6 text-center transition-opacity duration-300 data-[visible=false]:opacity-0"
          >
            <span className="text-base font-medium text-foreground sm:text-lg">{title}</span>
          </div>
        )}
      </MediaProvider>
      <DefaultVideoLayout icons={defaultLayoutIcons} translations={ZH_CN} />
    </MediaPlayer>
  );
}
