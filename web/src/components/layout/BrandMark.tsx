import { Link } from 'react-router-dom';
import { useSite } from '@/hooks/useSite';
import { cn } from '@/lib/utils';
import { BrandLogo } from './BrandLogo';

export function BrandMark({ className }: { className?: string }) {
  const { siteName } = useSite();
  return (
    <Link
      to="/"
      className={cn(
        'inline-flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight transition-colors hover:text-primary',
        className,
      )}
    >
      <BrandLogo className="size-6" />
      <span>{siteName}</span>
    </Link>
  );
}
