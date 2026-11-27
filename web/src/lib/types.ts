export type UserRole = 'admin' | 'viewer';

export type ProbeStatus = 'ok' | 'fake-search' | 'empty' | 'error';

export interface ProbeInfo {
  status: ProbeStatus;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

export interface VideoSource {
  id: string;
  name: string;
  url: string;
  detailUrl?: string;
  timeout?: number;
  retry?: number;
  isEnabled: boolean;
  useProxy?: boolean;
  probe?: ProbeInfo;
}

export interface SourceOption {
  id: string;
  name: string;
  isEnabled: boolean;
}

export interface UpstreamPreset {
  key: string;
  label: string;
  url: string;
}

export interface AdminSourcesPayload {
  sources: VideoSource[];
  customUpstreamUrl: string;
  presets: UpstreamPreset[];
  hasUpstreamProxy: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  poster: string;
  source: string;
  source_name: string;
  year: string;
  episodes: string[];
  episodes_titles: string[];
  class: string;
  desc: string;
  type_name: string;
  douban_id: number;
  score: string;
  actors: string;
  directors: string;
  area: string;
  lang: string;
  remark: string;
}

export interface RecommendationItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  rating: string;
  externalUrl?: string;
}

export interface RecommendationHomeResult {
  movies: RecommendationItem[];
  tvShows: RecommendationItem[];
  varietyShows: RecommendationItem[];
}

export type DoubanKind = 'movie' | 'tv' | 'show';

export interface DoubanCategoryResult {
  items: RecommendationItem[];
  total: number;
}

export interface DoubanCategories {
  movie: string[];
  tv: string[];
  show: string[];
}

export interface PlayRecord {
  title: string;
  source_name: string;
  year?: string;
  cover: string;
  total_episodes: number;
  index: number;
  play_time: number;
  total_time: number;
  save_time: number;
  search_title?: string;
}

export type PlaySessionMode = 'direct' | 'group' | 'search';

export interface PlaySessionPayload {
  mode: PlaySessionMode;
  source?: string;
  id?: string;
  title?: string;
  year?: string;
  poster?: string;
  source_name?: string;
  type?: 'movie' | 'tv';
  query?: string;
  preferredSource?: string;
  preferredId?: string;
  candidates?: SearchResult[];
  keyword?: string;
  expectedTitle?: string;
  expectedYear?: string;
  excludedSources?: string[];
  includedSources?: string[];
}

export interface PlaySessionResponse {
  detail: SearchResult;
  available_sources: SearchResult[];
  search_title: string;
  current_source: string;
  current_id: string;
  title: string;
  year: string;
  type: 'movie' | 'tv';
}

export interface SiteConfig {
  siteName: string;
  announcement: string;
  announcementTitle: string;
}
