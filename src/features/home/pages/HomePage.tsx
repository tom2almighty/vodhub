import { Announcement } from '../components/Announcement';
import { RecommendationSection } from '../components/RecommendationSection';
import { useRecommendations } from '../hooks/useRecommendations';

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
