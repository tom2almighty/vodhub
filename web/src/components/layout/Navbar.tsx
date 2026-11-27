import { LogOut, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SourcePickerSheet } from '@/components/SourcePickerSheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { BrandMark } from './BrandMark';
import { NAV_LINKS } from './navLinks';
import { ThemeToggle } from './ThemeToggle';

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
                nativeButton={false}
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

export function Navbar() {
  const location = useLocation();
  const { logout, isAdmin } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onSourcesPage = location.pathname === '/sources';

  return (
    <nav
      data-scrolled={scrolled}
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        'pt-[env(safe-area-inset-top)]',
        'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
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
        <div className="flex items-center gap-0.5 sm:gap-1">
          {isAdmin ? (
            <Button
              variant={onSourcesPage ? 'secondary' : 'ghost'}
              size="sm"
              nativeButton={false}
              render={<Link to="/sources" />}
              className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground sm:px-2.5"
              aria-label="视频源管理"
              title="视频源管理"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">视频源</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground sm:px-2.5"
              aria-label="视频源开关"
              title="视频源开关"
              onClick={() => setPickerOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">视频源</span>
            </Button>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground sm:px-2.5"
            aria-label="退出登录"
            title="退出登录"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-xs sm:inline">退出</span>
          </Button>
        </div>
      </div>
      {!isAdmin && <SourcePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} />}
    </nav>
  );
}
