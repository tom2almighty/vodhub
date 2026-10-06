import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { login } from '@/lib/api/auth';

interface LoginInput {
  password: string;
  remember: boolean;
}

export function useLogin() {
  const { setAuthenticated } = useAuth();
  return useMutation({
    mutationFn: async ({ password }: LoginInput) => {
      const token = await login(password);
      if (!token) throw new Error('密码错误');
      return token;
    },
    onSuccess: (token, { remember }) => {
      setAuthenticated(true, token, remember);
    },
  });
}
