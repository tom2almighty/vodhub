import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SHOW_AFTER_PX = 400;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Button
      type="button"
      size="icon"
      aria-label="返回顶部"
      onClick={handleClick}
      data-visible={visible}
      className={cn(
        'fixed z-50 h-10 w-10 rounded-full shadow-lg backdrop-blur',
        // Asymmetric-safe like the other fixed chrome: right-6 alone would sit
        // inside iPhone Duo's reserved region, and the bottom offset has to
        // clear the floating tab bar on top of the home-indicator inset.
        'right-[max(1.5rem,env(safe-area-inset-right))]',
        'bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6',
        'transition-all duration-200',
        'data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0',
        'data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100',
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
