import { Link } from 'react-router-dom';
import { useSite } from '@/hooks/useSite';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  const { siteName } = useSite();
  return (
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
