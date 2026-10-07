import { Link } from 'react-router-dom';
import { useSite } from '@/lib/hooks/useSite';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  const { siteName } = useSite();
  return (
    // No icon, so no flex/gap; and no `uppercase`, which is a no-op for CJK
    // site names while still affecting any Latin ones inconsistently.
    <Link
      to="/"
      className={cn(
        'shrink-0 text-lg font-semibold tracking-tight transition-colors hover:text-primary',
        className,
      )}
    >
      {siteName}
    </Link>
  );
}
