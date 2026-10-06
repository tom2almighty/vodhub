import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { verify } from '@/lib/api/auth';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/lib/auth';
import { queryClient } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

interface AuthContextValue {
  isAuthenticated: boolean;
  setAuthenticated: (next: boolean, token?: string, persist?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  setAuthenticated: () => {},
  logout: () => {},
});

function readInitialAuth(): boolean {
  return !!getAuthToken();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(readInitialAuth);

  // Best-effort server-side verification for restored sessions.
  // Stays silent on transient failures; protected APIs enforce token validity.
  const { data: verifyOk } = useQuery({
    queryKey: queryKeys.authVerify,
    queryFn: () => verify(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isAuthenticated && verifyOk === false) {
      clearAuthToken();
      setIsAuthenticated(false);
      queryClient.clear();
    }
  }, [verifyOk, isAuthenticated]);

  const setAuthenticated = useCallback((next: boolean, token?: string, persist?: boolean) => {
    if (next && token) setAuthToken(token, !!persist);
    if (!next) clearAuthToken();
    setIsAuthenticated(next);
    if (!next) queryClient.clear();
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setIsAuthenticated(false);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
