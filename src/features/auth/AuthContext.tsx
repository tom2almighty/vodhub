import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type VerifyResult, verify } from '@/lib/api/auth';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/lib/auth';
import { queryClient, resetQueryCache } from '@/lib/query/client';
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

  // Best-effort server-side verification for restored sessions. Only an
  // explicit rejection ends the session; a network failure is inconclusive and
  // leaves the token in place (protected APIs enforce validity anyway).
  const { data: verifyResult } = useQuery({
    queryKey: queryKeys.authVerify,
    queryFn: () => verify(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isAuthenticated && verifyResult === 'invalid') {
      clearAuthToken();
      setIsAuthenticated(false);
      resetQueryCache();
    }
  }, [verifyResult, isAuthenticated]);

  const setAuthenticated = useCallback((next: boolean, token?: string, persist?: boolean) => {
    if (next && token) {
      setAuthToken(token, !!persist);
      // Freshly issued by the server — no need to spend a round trip verifying it.
      queryClient.setQueryData(queryKeys.authVerify, 'valid' satisfies VerifyResult);
    }
    if (!next) clearAuthToken();
    setIsAuthenticated(next);
    if (!next) resetQueryCache();
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setIsAuthenticated(false);
    resetQueryCache();
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
