import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BackToTop } from '@/components/shell/BackToTop';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { Navbar } from '@/components/shell/Navbar';
import { Spinner } from '@/components/ui/spinner';
import { BareLayout } from './layouts/BareLayout';
import { ProtectedLayout } from './layouts/ProtectedLayout';

const HomePage = lazy(() => import('@/features/home/pages/HomePage'));
const HistoryPage = lazy(() => import('@/features/home/pages/HistoryPage'));
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const SearchPage = lazy(() => import('@/features/search/pages/SearchPage'));
const DoubanPage = lazy(() => import('@/features/douban/pages/DoubanPage'));
const PlayPage = lazy(() => import('@/features/play/pages/PlayPage'));

function Loading() {
  return (
    <div className="flex min-h-96 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  // Keyed on the pathname so each navigation remounts the wrapper and replays
  // the CSS entrance animation. CSS rather than motion/react: the exit phase
  // was 150ms of blank screen for a library that dominated the first paint.
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Routes location={location}>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/douban" element={<DoubanPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
}

function ProtectedShell() {
  return (
    <>
      <Navbar />
      <main>
        <Suspense fallback={<Loading />}>
          <AnimatedRoutes />
        </Suspense>
      </main>
      <BackToTop />
      <BottomTabBar />
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<BareLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route path="*" element={<ProtectedShell />} />
      </Routes>
    </Suspense>
  );
}
