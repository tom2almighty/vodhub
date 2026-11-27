import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { BackToTop } from '@/components/layout/BackToTop';
import { BottomTabBar } from '@/components/layout/BottomTabBar';
import { Navbar } from '@/components/layout/Navbar';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/query';

const HomePage = lazy(() => import('@/pages/HomePage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const DoubanPage = lazy(() => import('@/pages/DoubanPage'));
const PlayPage = lazy(() => import('@/pages/PlayPage'));
const SourcesPage = lazy(() => import('@/pages/SourcesPage'));

function Loading() {
  return (
    <div className="flex min-h-96 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    const target = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${target}`} replace />;
  }
  return <Outlet />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Routes location={location}>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/douban" element={<DoubanPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route
            path="/sources"
            element={
              <AdminRoute>
                <SourcesPage />
              </AdminRoute>
            }
          />
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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<ProtectedShell />} />
            </Routes>
          </Suspense>
          <Toaster position="bottom-center" richColors closeButton />
          {import.meta.env.DEV && (
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
          )}
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
