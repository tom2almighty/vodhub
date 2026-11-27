import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchSiteConfig } from '@/lib/api';
import { queryKeys } from '@/lib/query';

export function useSite() {
  const { data } = useQuery({
    queryKey: queryKeys.site,
    queryFn: () => fetchSiteConfig(),
    staleTime: Infinity,
  });
  const siteName = data?.siteName ?? 'vodhub';

  useEffect(() => {
    if (typeof document !== 'undefined' && siteName) {
      document.title = siteName;
    }
  }, [siteName]);

  return {
    siteName,
    announcement: data?.announcement ?? '',
    announcementTitle: data?.announcementTitle ?? '',
  };
}
