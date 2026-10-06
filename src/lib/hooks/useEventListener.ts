import { useEffect, useRef } from 'react';

type EventTarget =
  | Window
  | Document
  | HTMLElement
  | {
      addEventListener: Window['addEventListener'];
      removeEventListener: Window['removeEventListener'];
    };

export function useEventListener<E extends Event = Event>(
  eventName: string,
  handler: (event: E) => void,
  target: EventTarget | null = typeof window !== 'undefined' ? window : null,
  options?: AddEventListenerOptions | boolean,
): void {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!target) return;
    const listener: EventListener = (event) => savedHandler.current(event as E);
    target.addEventListener(eventName, listener, options);
    return () => target.removeEventListener(eventName, listener, options);
  }, [eventName, target, options]);
}
