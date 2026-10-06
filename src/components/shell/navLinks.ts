import type { LucideIcon } from 'lucide-react';
import { Clock, Compass, Home as HomeIcon, Search } from 'lucide-react';

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

/** Primary navigation entries, shared by the desktop top bar and the mobile bottom tab bar. */
export const NAV_LINKS: NavLink[] = [
  { label: '首页', href: '/', icon: HomeIcon, match: (p) => p === '/' },
  { label: '搜索', href: '/search', icon: Search, match: (p) => p === '/search' },
  { label: '分类', href: '/douban', icon: Compass, match: (p) => p === '/douban' },
  { label: '历史', href: '/history', icon: Clock, match: (p) => p === '/history' },
];
