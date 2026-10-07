import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_LINKS } from './navLinks';

/**
 * Mobile-only bottom tab bar. Styled after the current iOS tab bar's shape: a
 * floating, inset, fully-rounded capsule rather than a bar welded to the bottom
 * edge, so content scrolls behind it and peeks through around it.
 *
 * Hidden on md+ where the top-bar pill nav takes over.
 */
export function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="主导航"
      className={cn(
        'fixed z-40 md:hidden',
        // iPhone Duo's safe-area insets are asymmetric (a reserved region sits
        // on one side), so each edge gets its own max() — a symmetric inset-x
        // would let the capsule slide under that region. Every value here is 0
        // on devices without insets.
        'left-[max(0.75rem,env(safe-area-inset-left))]',
        'right-[max(0.75rem,env(safe-area-inset-right))]',
        'bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
        'rounded-full border border-border bg-background/85 backdrop-blur-xl',
        'shadow-lg',
      )}
    >
      <ul className="flex items-stretch gap-1 p-1.5">
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
                  'flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5',
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
