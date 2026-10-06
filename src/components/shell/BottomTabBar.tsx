import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_LINKS } from './navLinks';

/**
 * Mobile-only bottom tab bar (iOS-style). Shows icon + label for each primary
 * nav entry. Hidden on md+ where the top-bar pill nav takes over. All colours
 * and radii come from theme tokens so it adapts to light/dark automatically.
 */
export function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="主导航"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-border bg-background/85 backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch gap-1 px-2 py-1.5">
        {NAV_LINKS.map((l) => {
          const Icon = l.icon;
          const active = l.match(pathname);
          return (
            <li key={l.href} className="flex-1">
              <Link
                to={l.href}
                aria-current={active ? 'page' : undefined}
                data-active={active}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5',
                  'text-xs font-medium leading-none transition-colors',
                  'text-muted-foreground hover:text-foreground',
                  'data-[active=true]:bg-accent data-[active=true]:text-accent-foreground',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
                <span>{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
