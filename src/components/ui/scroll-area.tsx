import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root> {}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <BaseScrollArea.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
      <BaseScrollArea.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </BaseScrollArea.Viewport>
      <ScrollBar />
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  ),
);
ScrollArea.displayName = 'ScrollArea';

export interface ScrollBarProps
  extends React.ComponentPropsWithoutRef<typeof BaseScrollArea.Scrollbar> {
  orientation?: 'vertical' | 'horizontal';
}

const ScrollBar = React.forwardRef<HTMLDivElement, ScrollBarProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <BaseScrollArea.Scrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-0.5',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-0.5',
        className,
      )}
      {...props}
    >
      <BaseScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
    </BaseScrollArea.Scrollbar>
  ),
);
ScrollBar.displayName = 'ScrollBar';

export { ScrollArea, ScrollBar };
