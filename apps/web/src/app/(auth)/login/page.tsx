'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassLayer } from '@/components/glass';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { isValidEmail } from '@echolife/shared';

interface FormErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!email) {
      next.email = '请输入邮箱';
    } else if (!isValidEmail(email)) {
      next.email = '邮箱格式不正确';
    }
    if (!password) {
      next.password = '请输入密码';
    } else if (password.length < 8) {
      next.password = '密码至少 8 位';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const isFormValid = React.useMemo(() => {
    return email && isValidEmail(email) && password && password.length >= 8;
  }, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '登录失败，请稍后重试';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center"
    >
      {/* Logo & heading — iOS-style refined spacing */}
      <div className="mb-12 text-center">
        {/* Breathing seedling */}
        <GlassLayer 
          intensity="strong" 
          asChild
          fresnel
          specular
          thickness
          caustic={false}
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] shadow-lg"
          >
            <TreePine className="h-9 w-9 text-primary" />
          </motion.div>
        </GlassLayer>

        <h1 className="text-[2.5rem] font-display font-semibold tracking-tight text-text leading-tight">
          EchoLife
        </h1>
        <p className="mt-4 text-base text-text-muted leading-relaxed tracking-wide">
          你的数字生命正在等待苏醒
        </p>
      </div>

      {/* Liquid Glass Card — Apple-style multi-layer glass with refined edge glow */}
      <GlassLayer 
        intensity="modal" 
        asChild
        fresnel
        specular
        thickness
        dispersion={false}
        caustic={false}
        className="w-full max-w-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="p-10"
        >
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Input
              label="邮箱"
              type="email"
              placeholder="you@example.com"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              disabled={loading}
            />

            <div className="relative">
              <Input
                label="密码"
                type={showPassword ? 'text' : 'password'}
                placeholder="输入你的密码"
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-9 text-text-muted transition-colors hover:text-text"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {submitError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
              >
                {submitError}
              </motion.div>
            )}

            <motion.div 
              whileTap={{ scale: 0.98 }}
              className="pt-2"
            >
              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!isFormValid || loading}
                className="w-full h-14 text-base font-semibold tracking-wide"
              >
                {!loading && <ArrowRight className="h-5 w-5" />}
                进入 EchoLife
              </Button>
            </motion.div>
          </form>

          <div className="mt-8 text-center text-sm text-text-muted">
            还没有数字生命？{' '}
            <Link
              href="/register"
              className="font-semibold text-primary transition-colors hover:text-primary-hover"
            >
              开始生长
            </Link>
          </div>
        </motion.div>
      </GlassLayer>

      {/* Footer tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-10 text-center text-xs text-text-subtle tracking-wider"
      >
        时间是树 · 记忆是叶 · 时墨是生命
      </motion.p>
    </motion.div>
  );
}
