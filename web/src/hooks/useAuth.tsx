import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { login, type VerifyResult, verify } from '@/lib/api';
import { clearAuthToken, getAuthToken, getTokenRole, setAuthToken } from '@/lib/auth';
import { queryClient, queryKeys, resetQueryCache } from '@/lib/query';
import type { UserRole } from '@/lib/types';

interface AuthContextValue {
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  setAuthenticated: (next: boolean, token?: string, role?: UserRole, persist?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  role: null,
  isAdmin: false,
  setAuthenticated: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAuthToken());
  const [role, setRole] = useState<UserRole | null>(() => getTokenRole());

  const { data: verifyResult } = useQuery({
    queryKey: queryKeys.authVerify,
    queryFn: () => verify(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!isAuthenticated || !verifyResult) return;
    if (verifyResult.status === 'invalid') {
      clearAuthToken();
      setIsAuthenticated(false);
      setRole(null);
      resetQueryCache();
    } else if (verifyResult.status === 'valid') {
      setRole(verifyResult.role);
    }
  }, [verifyResult, isAuthenticated]);

  const setAuthenticated = useCallback(
    (next: boolean, token?: string, nextRole?: UserRole, persist?: boolean) => {
      if (next && token) {
        setAuthToken(token, !!persist);
        const resolvedRole = nextRole ?? getTokenRole() ?? 'viewer';
        setRole(resolvedRole);
        queryClient.setQueryData(queryKeys.authVerify, {
          status: 'valid',
          role: resolvedRole,
        } satisfies VerifyResult);
      }
      if (!next) {
        clearAuthToken();
        setRole(null);
      }
      setIsAuthenticated(next);
      if (!next) resetQueryCache();
    },
    [],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setIsAuthenticated(false);
    setRole(null);
    resetQueryCache();
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, role, isAdmin: role === 'admin', setAuthenticated, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useLogin() {
  const { setAuthenticated } = useAuth();
  return useMutation({
    mutationFn: async ({ password }: { password: string; remember: boolean }) => {
      const result = await login(password);
      if (!result) throw new Error('密码错误');
      return result;
    },
    onSuccess: (result, { remember }) => {
      setAuthenticated(true, result.token, result.role, remember);
    },
  });
}
