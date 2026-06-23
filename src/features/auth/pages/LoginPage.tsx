import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { wasPersisted } from '@/lib/auth';
import { useLogin } from '../hooks/useLogin';
import { useSite } from '@/lib/hooks/useSite';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => wasPersisted());
  const { siteName } = useSite();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    loginMutation.mutate(
      { password, remember },
      {
        onSuccess: () => {
          const redirect = searchParams.get('redirect') || '/';
          navigate(redirect, { replace: true });
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-xl font-bold">{siteName[0]?.toUpperCase()}</span>
            </div>
            <CardTitle className="text-xl">{siteName}</CardTitle>
            <p className="text-sm text-muted-foreground">输入密码以继续</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="sr-only">
                  密码
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    placeholder="访问密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>

              <label
                htmlFor="remember"
                className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground"
              >
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                记住密码
              </label>

              {loginMutation.isError && (
                <p className="text-center text-xs text-destructive" role="alert">
                  {loginMutation.error instanceof Error
                    ? loginMutation.error.message
                    : '登录失败'}
                </p>
              )}

              <Button
                type="submit"
                disabled={loginMutation.isPending || !password}
                className="w-full"
              >
                {loginMutation.isPending ? '验证中...' : '进入'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
