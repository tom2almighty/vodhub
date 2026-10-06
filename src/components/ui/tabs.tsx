import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TabsProps extends React.ComponentPropsWithoutRef<typeof BaseTabs.Root> {}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ className, ...props }, ref) => (
  <BaseTabs.Root ref={ref} className={cn('flex flex-col', className)} {...props} />
));
Tabs.displayName = 'Tabs';

export interface TabsListProps extends React.ComponentPropsWithoutRef<typeof BaseTabs.List> {}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof BaseTabs.Tab> {
  asChild?: boolean;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, render, asChild = false, children, ...props }, ref) => {
    const effectiveRender =
      render ?? (asChild && React.isValidElement(children) ? children : undefined);
    const content = effectiveRender && asChild ? undefined : children;

    return (
      <BaseTabs.Tab
        ref={ref}
        render={effectiveRender}
        nativeButton={!effectiveRender}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          'data-active:bg-background data-active:text-foreground data-active:shadow-sm',
          'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
          className,
        )}
        {...props}
      >
        {content}
      </BaseTabs.Tab>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.ComponentPropsWithoutRef<typeof BaseTabs.Panel> {}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Panel
      ref={ref}
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  ),
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsContent, TabsList, TabsTrigger };
