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
      {/* Always rendered when that direction can scroll; touch devices keep
          them visible while hover-capable pointers reveal them on row hover. */}
      <CarouselPrevious className="inset-y-auto top-[38%] left-1.5 z-20 flex h-8 w-8 -translate-y-1/2 border-border/80 bg-background/85 opacity-90 shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-background disabled:hidden [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 sm:h-9 sm:w-9" />
      <CarouselNext className="inset-y-auto top-[38%] right-1.5 z-20 flex h-8 w-8 -translate-y-1/2 border-border/80 bg-background/85 opacity-90 shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-background disabled:hidden [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 sm:h-9 sm:w-9" />
    </Carousel>
  );
}
