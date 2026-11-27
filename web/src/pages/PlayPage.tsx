import type { MediaTimeUpdateEventDetail } from '@vidstack/react';
import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PlaybackPanel } from '@/components/PlaybackPanel';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { fetchSourceDetail } from '@/lib/api';
import { getAllPlayRecords, savePlayRecord } from '@/lib/storage';
import type { PlaySessionResponse, SearchResult } from '@/lib/types';
import { generateStorageKey } from '@/lib/utils';

const VidstackPlayer = lazy(() =>
  import('@/components/media/VidstackPlayer').then((m) => ({ default: m.VidstackPlayer })),
);

const SESSION_KEY = 'vodhub_play_session';
const PROGRESS_SAVE_INTERVAL_MS = 5000;
const PROGRESS_RESUME_THRESHOLD_S = 5;

interface SnapshotState {
  source: string;
  id: string;
  index: number;
  time: number;
  total: number;
}

function PlayerLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <Spinner className="text-white" />
    </div>
  );
}

export default function PlayPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [cover, setCover] = useState('');
  const [currentSource, setCurrentSource] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [switching, setSwitching] = useState(false);
  const [startTime, setStartTime] = useState(0);

  const initialized = useRef(false);
  const snapshotRef = useRef<SnapshotState>({ source: '', id: '', index: 0, time: 0, total: 0 });
  const lastSaveRef = useRef(0);
  const metaRef = useRef({ title: '', year: '', detail: null as SearchResult | null });
  const switchSeqRef = useRef(0);
  const switchAbortRef = useRef<AbortController | null>(null);
  const storageWarnedRef = useRef(false);

  useEffect(() => {
    metaRef.current = { title, year, detail };
  }, [title, year, detail]);

  const videoUrl = useMemo(() => {
    if (!detail?.episodes?.length) return '';
    return detail.episodes[episodeIndex] || detail.episodes[0] || '';
  }, [detail, episodeIndex]);

  const persistProgress = useCallback((force = false) => {
    const s = snapshotRef.current;
    if (!s.source || !s.id || s.total <= 0) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
    lastSaveRef.current = now;
    const meta = metaRef.current;
    const ok = savePlayRecord(s.source, s.id, {
      title: meta.title || '',
      source_name: meta.detail?.source_name || '',
      year: meta.year || '',
      cover: meta.detail?.poster || '',
      total_episodes: meta.detail?.episodes?.length || 1,
      index: s.index,
      play_time: Math.floor(s.time),
      total_time: Math.floor(s.total),
      save_time: now,
      search_title: meta.title || '',
    });
    if (!ok && !storageWarnedRef.current) {
      storageWarnedRef.current = true;
      toast.error('浏览器存储空间不足，观看进度无法保存');
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setError('播放会话已失效，请返回搜索页重试');
      setLoading(false);
      return;
    }

    try {
      const session = JSON.parse(raw) as PlaySessionResponse;
      setAvailableSources(session.available_sources || []);
      setTitle(session.title);
      setYear(session.year);
      setCurrentSource(session.current_source);
      setCurrentId(session.current_id);
      const d = session.detail;
      setDetail(d);
      setCover(d?.poster || '');

      const records = getAllPlayRecords();
      const saved = records[generateStorageKey(session.current_source, session.current_id)];
      setEpisodeIndex(saved?.index ?? 0);
      setStartTime(saved && saved.play_time > PROGRESS_RESUME_THRESHOLD_S ? saved.play_time : 0);
      setLoading(false);
    } catch {
      setError('会话数据损坏');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    snapshotRef.current = {
      source: currentSource,
      id: currentId,
      index: episodeIndex,
      time: 0,
      total: 0,
    };
  }, [currentSource, currentId, episodeIndex]);

  useEffect(() => {
    const onHide = () => persistProgress(true);
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onHide);
      persistProgress(true);
      switchAbortRef.current?.abort();
    };
  }, [persistProgress]);

  const handleTimeUpdate = useCallback(
    (detail: MediaTimeUpdateEventDetail) => {
      snapshotRef.current.time = detail.currentTime;
      persistProgress();
    },
    [persistProgress],
  );

  const handlePause = useCallback(() => persistProgress(true), [persistProgress]);

  const handleCanPlay = useCallback((detail: { duration?: number }) => {
    if (detail?.duration && Number.isFinite(detail.duration)) {
      snapshotRef.current.total = detail.duration;
    }
    setSwitching(false);
  }, []);

  const handleEnded = useCallback(() => {
    const total = snapshotRef.current.total || 0;
    if (total > 0) {
      snapshotRef.current.time = total;
      persistProgress(true);
    }
    const eps = metaRef.current.detail?.episodes;
    if (eps && snapshotRef.current.index < eps.length - 1) {
      setStartTime(0);
      setEpisodeIndex((p) => p + 1);
    }
  }, [persistProgress]);

  const handleEpisodeChange = useCallback(
    (ep: number) => {
      persistProgress(true);
      setSwitching(false);
      setStartTime(0);
      setEpisodeIndex(ep - 1);
    },
    [persistProgress],
  );

  const handleSourceChange = useCallback(
    async (newSource: string, newId: string, _newTitle: string) => {
      if (newSource === currentSource && newId === currentId) return;
      persistProgress(true);
      const carryOverTime = snapshotRef.current.time;

      switchAbortRef.current?.abort();
      const controller = new AbortController();
      switchAbortRef.current = controller;
      const seq = switchSeqRef.current + 1;
      switchSeqRef.current = seq;

      setSwitching(true);
      try {
        const nd = await fetchSourceDetail(newSource, newId, controller.signal);
        let resumeTime = carryOverTime;
        let resumeIndex = 0;
        const records = getAllPlayRecords();
        const saved = records[generateStorageKey(newSource, newId)];
        if (saved) {
          resumeIndex = saved.index ?? 0;
          if (saved.play_time > PROGRESS_RESUME_THRESHOLD_S) {
            resumeTime = saved.play_time;
          }
        }

        if (seq !== switchSeqRef.current) return;

        setDetail(nd);
        setTitle(nd.title || title);
        setCover(nd.poster);
        setCurrentSource(newSource);
        setCurrentId(newId);
        setStartTime(resumeTime);
        setEpisodeIndex(resumeIndex);
        if (!nd.episodes?.length) setSwitching(false);
        toast.success('已切换播放源');
      } catch (err) {
        if (seq !== switchSeqRef.current) return;
        setSwitching(false);
        if ((err as Error)?.name !== 'AbortError') toast.error('切换失败');
        throw err;
      }
    },
    [currentSource, currentId, title, persistProgress],
  );

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          加载中
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-base">{error}</p>
        <Button variant="secondary" nativeButton={false} render={<Link to="/search" />}>
          <ArrowLeft className="h-4 w-4" />
          返回搜索
        </Button>
      </div>
    );
  }

  const playerKey = `${currentSource}+${currentId}+${episodeIndex}`;

  return (
    <div className="app-page">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className="relative overflow-hidden rounded-lg border border-border bg-black shadow-lg"
          style={{ aspectRatio: '16 / 9' }}
        >
          <div className="absolute inset-0 bg-black">
            {videoUrl && (
              <Suspense fallback={<PlayerLoading />}>
                <VidstackPlayer
                  key={playerKey}
                  src={videoUrl}
                  poster={cover}
                  startTime={startTime}
                  title={title}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                  onCanPlay={handleCanPlay}
                  onPause={handlePause}
                  onError={(err) => console.error('播放器错误', err)}
                />
              </Suspense>
            )}
          </div>
          {switching && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Spinner className="text-white" />
                切换中
              </div>
            </div>
          )}
        </div>

        <aside className="min-h-0 lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100svh-7rem)] lg:flex-col">
          <PlaybackPanel
            totalEpisodes={detail?.episodes?.length || 0}
            episodesTitles={detail?.episodes_titles || []}
            episodeValue={episodeIndex + 1}
            onEpisodeChange={handleEpisodeChange}
            currentSource={currentSource}
            currentId={currentId}
            availableSources={availableSources}
            onSourceChange={handleSourceChange}
            info={{
              title,
              year: detail?.year || year,
              score: detail?.score,
              currentEpisodeTitle: detail?.episodes_titles?.[episodeIndex],
              typeName: detail?.type_name,
              area: detail?.area,
              remark: detail?.remark,
              sourceName: detail?.source_name,
              desc: detail?.desc,
            }}
          />
        </aside>
      </div>
    </div>
  );
}
