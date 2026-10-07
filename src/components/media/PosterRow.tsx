import { isValidElement } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

export function PosterRow({ children }: { children: React.ReactNode[] }) {
  return (
    <Carousel
      opts={{ align: 'start', dragFree: true, containScroll: 'trimSnaps' }}
      className="group/row relative"
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
      <CarouselPrevious className="left-1 hidden h-9 w-9 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 sm:flex" />
      <CarouselNext className="right-1 hidden h-9 w-9 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 sm:flex" />
    </Carousel>
  );
}
