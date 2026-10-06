import { Progress as BaseProgress } from '@base-ui/react/progress';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface ProgressProps
  extends Omit<React.ComponentPropsWithoutRef<typeof BaseProgress.Root>, 'value'> {
  value?: number | null;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const numValue = typeof value === 'number' ? value : 0;
    return (
      <BaseProgress.Root
        ref={ref}
        value={value}
        className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)}
        {...props}
      >
        <BaseProgress.Track className="h-full w-full">
          <BaseProgress.Indicator
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, numValue))}%` }}
          />
        </BaseProgress.Track>
      </BaseProgress.Root>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };
