import { cn } from '@/lib/utils';

export function PosterGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-x-3 gap-y-8',
        'sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-x-5 sm:gap-y-10',
        className,
      )}
    >
      {children}
    </div>
  );
}
