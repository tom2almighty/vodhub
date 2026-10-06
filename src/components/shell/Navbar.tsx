import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/AuthContext';
import { cn } from '@/lib/utils';
import { BrandMark } from './BrandMark';
import { NAV_LINKS } from './navLinks';

/**
 * Segmented pill nav, modeled after the shadcn Tabs trigger style. Hidden on
 * small screens, where the bottom tab bar (BottomTabBar) takes over.
 */
function NavLinks({ pathname }: { pathname: string }) {
  const currentTab = NAV_LINKS.find((l) => l.match(pathname))?.href ?? '';

  return (
    <div className="hidden md:inline-flex">
      <Tabs value={currentTab}>
        <TabsList>
          {NAV_LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <TabsTrigger
                key={l.href}
                value={l.href}
                render={<Link to={l.href} aria-label={l.label} className="gap-1.5" />}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{l.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Button variant="ghost" size="icon" aria-label="退出登录" title="退出登录" onClick={logout}>
      <LogOut className="h-4 w-4" />
    </Button>
  );
}

export function Navbar() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      data-scrolled={scrolled}
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        'data-[scrolled=true]:border-b data-[scrolled=true]:border-border',
        'data-[scrolled=true]:bg-background/85 data-[scrolled=true]:backdrop-blur-xl',
        'data-[scrolled=false]:bg-background/40 data-[scrolled=false]:backdrop-blur-sm',
      )}
    >
      <div className="app-container flex h-14 items-center gap-3 px-4 md:px-10 lg:px-14">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <BrandMark />
          <NavLinks pathname={location.pathname} />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
