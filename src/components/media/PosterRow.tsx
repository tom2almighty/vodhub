import { isValidElement } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

/**
 * Static gradient masks at the row edges.
 *
 * `scroll-fade-*` from shadcn/tailwind.css looks like the right tool but cannot
 * work here: it is driven by `animation-timeline: scroll(self inline)`, and
 * embla moves the track with translate3d instead of scrolling the container, so
 * there is no scroll position to key off. The masks only appear once the row can
 * actually move in that direction.
 */
function EdgeMasks() {
  const { canScrollPrev, canScrollNext } = useCarousel();
  return (
    <>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-background to-transparent transition-opacity duration-300 sm:w-14',
          canScrollPrev ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-background to-transparent transition-opacity duration-300 sm:w-14',
          canScrollNext ? 'opacity-100' : 'opacity-0',
        )}
      />
    </>
  );
}

interface PosterRowProps {
  children: React.ReactNode[];
  /** Accessible name for the carousel region. */
  label?: string;
}

export function PosterRow({ children, label }: PosterRowProps) {
  return (
    <Carousel
      // Snapping rather than dragFree: a free-dragging row settles at arbitrary
      // offsets, while Netflix-style rows land on a card boundary.
      opts={{ align: 'start', containScroll: 'trimSnaps' }}
      className="group/row relative"
      aria-label={label}
    >
      <CarouselContent className="-ml-3">
        {children.map((child, i) => (
          <CarouselItem
            // Prefer the child's own key over the array index so list changes
            // don't remount every slide.
            key={isValidElement(child) ? (child.key ?? `slide-${i}`) : `slide-${i}`}
            className="basis-[34%] pl-3 sm:basis-[26%] md:basis-[22%] lg:basis-[18%] xl:basis-[14%]"
          >
            {child}
          </CarouselItem>
        ))}
      </CarouselContent>
      <EdgeMasks />
      {/* opacity-0 on its own left these invisible but still focusable;
          focus-within and focus-visible bring them back for keyboard users. */}
      <CarouselPrevious className="left-1 z-20 hidden h-9 w-9 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 sm:flex" />
      <CarouselNext className="right-1 z-20 hidden h-9 w-9 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 sm:flex" />
    </Carousel>
  );
}
