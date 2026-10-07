import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { useSite } from '@/lib/hooks/useSite';

const DISMISS_KEY = 'vodhub_announcement_dismissed';

/**
 * Reads the stored dismissal synchronously. Doing this in the useState
 * initializer instead of an effect means the banner's visibility is decided in
 * the same render that receives the announcement — the effect-based version
 * mounted hidden and then popped in, shifting the page after first paint.
 */
function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Site-wide notice shown at the top of the home page (configured via the
 * SITE_ANNOUNCEMENT env). Dismissal is remembered per announcement content, so
 * editing the text makes the banner reappear for everyone.
 */
export function Announcement() {
  const { announcement, announcementTitle } = useSite();
  const [dismissedFor, setDismissedFor] = useState(readDismissed);

  if (!announcement || dismissedFor === announcement) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, announcement);
    } catch {
      /* ignore */
    }
    setDismissedFor(announcement);
  };

  return (
    <div className="relative flex items-start gap-3 rounded-lg border border-border bg-card p-4 pr-11">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        {announcementTitle && (
          <p className="text-sm font-semibold text-foreground">{announcementTitle}</p>
        )}
        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
          {announcement}
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="关闭公告"
        className="absolute right-3 top-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
