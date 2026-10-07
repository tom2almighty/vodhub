import type { MediaTimeUpdateEventDetail } from '@vidstack/react';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fetchSourceDetail, type PlaySessionResponse } from '@/lib/api/sources';
import { generateStorageKey, getAllPlayRecords, savePlayRecord } from '@/lib/db';
import type { SearchResult } from '@/lib/types';
import { PlaybackPanel } from '../components/PlaybackPanel';
import { VidstackPlayer } from '../components/VidstackPlayer';

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
  const [switchingText, setSwitchingText] = useState('切换中');
  const [startTime, setStartTime] = useState(0);
  const [adFilter, setAdFilter] = useState(false);

  const initialized = useRef(false);
  const snapshotRef = useRef<SnapshotState>({ source: '', id: '', index: 0, time: 0, total: 0 });
  const lastSaveRef = useRef(0);
  const metaRef = useRef({ title: '', year: '', detail: null as SearchResult | null });

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
    savePlayRecord(s.source, s.id, {
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
  }, []);

  // Initialise from session storage once
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

      getAllPlayRecords()
        .then((records) => {
          const key = generateStorageKey(session.current_source, session.current_id);
          const saved = records[key];
          const startIndex = saved?.index ?? 0;
          setEpisodeIndex(startIndex);
          if (saved && saved.play_time > PROGRESS_RESUME_THRESHOLD_S) {
            setStartTime(saved.play_time);
          } else {
            setStartTime(0);
          }
          setLoading(false);
        })
        .catch(() => {
          setStartTime(0);
          setLoading(false);
        });
    } catch {
      setError('会话数据损坏');
      setLoading(false);
    }
  }, []);

  // Reset snapshot when source/episode changes
  useEffect(() => {
    snapshotRef.current = {
      source: currentSource,
      id: currentId,
      index: episodeIndex,
      time: 0,
      total: 0,
    };
  }, [currentSource, currentId, episodeIndex]);

  // Persist on tab close / page hide / unmount
  useEffect(() => {
    const handler = () => persistProgress(true);
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
      persistProgress(true);
    };
  }, [persistProgress]);

  const handleTimeUpdate = useCallback(
    (detail: MediaTimeUpdateEventDetail) => {
      snapshotRef.current.time = detail.currentTime;
      // Vidstack TimeUpdateDetail in 1.x may not include duration; read off the ref instead.
      // We let onCanPlay set total via canplay handler below.
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

  // Toggling the ad filter rebuilds the hls instance (via playerKey), so carry
  // the current playback time over and resume from it.
  const handleToggleAdFilter = useCallback(() => {
    persistProgress(true);
    setStartTime(snapshotRef.current.time || 0);
    setSwitchingText('重新加载中');
    setSwitching(true);
    setAdFilter((v) => !v);
  }, [persistProgress]);

  const handleSourceChange = useCallback(
    async (newSource: string, newId: string, _newTitle: string) => {
      if (newSource === currentSource && newId === currentId) return;
      persistProgress(true);
      const carryOverTime = snapshotRef.current.time;
      setSwitchingText('切换中');
      setSwitching(true);
      try {
        const nd = await fetchSourceDetail(newSource, newId);
        let resumeTime = carryOverTime;
        let resumeIndex = 0;
        try {
          const records = await getAllPlayRecords();
          const saved = records[generateStorageKey(newSource, newId)];
          if (saved) {
            resumeIndex = saved.index ?? 0;
            if (saved.play_time > PROGRESS_RESUME_THRESHOLD_S) {
              resumeTime = saved.play_time;
            }
          }
        } catch {
          /* ignore */
        }
        setDetail(nd);
        setTitle(nd.title || title);
        setCover(nd.poster);
        setCurrentSource(newSource);
        setCurrentId(newId);
        setStartTime(resumeTime);
        setEpisodeIndex(resumeIndex);
        toast.success('已切换播放源');
      } catch (err) {
        setSwitching(false);
        toast.error('切换失败');
        throw err;
      }
    },
    [currentSource, currentId, title, persistProgress],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          加载中
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-base">{error}</p>
        <Button variant="secondary" render={<Link to="/search" />}>
          <ArrowLeft className="h-4 w-4" />
          返回搜索
        </Button>
      </div>
    );
  }

  const playerKey = `${currentSource}+${currentId}+${episodeIndex}+${adFilter}`;

  return (
    <div className="app-page">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className="relative overflow-hidden rounded-lg border border-border bg-black shadow-lg"
          style={{ aspectRatio: '16 / 9' }}
        >
          <div className="absolute inset-0 bg-black">
            {videoUrl && (
              <VidstackPlayer
                key={playerKey}
                src={videoUrl}
                poster={cover}
                startTime={startTime}
                title={title}
                adFilterEnabled={adFilter}
                onToggleAdFilter={handleToggleAdFilter}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onCanPlay={handleCanPlay}
                onPause={handlePause}
                onError={(err) => console.error('player error', err)}
              />
            )}
          </div>
          {switching && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {switchingText}
              </div>
            </div>
          )}
        </div>

        {/* lg+: wrapper is positioned, panel fills via absolute so the grid row */}
        {/* height is governed entirely by the player's aspect-ratio.            */}
        {/* mobile: panel stacks below in normal flow.                            */}
        <div className="lg:relative">
          <aside className="min-h-0 lg:absolute lg:inset-0">
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
    </div>
  );
}
