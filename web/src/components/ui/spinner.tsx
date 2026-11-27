import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Official shadcn/base-nova Spinner. Replaces the hand-rolled
 * `border-2 rounded-full animate-spin` div that was duplicated across eight
 * call sites in two colour variants — and unlike those, it carries a role and a
 * label for assistive tech.
 */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label="加载中"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
