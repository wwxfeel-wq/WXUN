'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassLayer } from '@/components/glass';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { isValidEmail } from '@echolife/shared';
import { cn } from '@/lib/utils';

interface FormErrors {
  email?: string;
  password?: string;
  nickname?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [nickname, setNickname] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const hasLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!email) {
      next.email = '请输入邮箱';
    } else if (!isValidEmail(email)) {
      next.email = '邮箱格式不正确';
    }
    if (!password) {
      next.password = '请输入密码';
    } else if (!hasLength || !hasLetter || !hasNumber) {
      next.password = '密码需至少 8 位且包含字母和数字';
    }
    if (!nickname) {
      next.nickname = '请输入昵称';
    } else if (nickname.length < 2) {
      next.nickname = '昵称至少 2 个字符';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await register(email, password, nickname);
      router.push('/');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '注册失败，请稍后重试';
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
    >
      {/* Logo & heading */}
      <div className="mb-10 text-center">
        <GlassLayer intensity="strong" asChild>
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl"
          >
            <TreePine className="h-8 w-8 text-primary" />
          </motion.div>
        </GlassLayer>

        <h1 className="text-3xl font-display font-semibold tracking-tight text-text">
          播下第一颗种子
        </h1>
        <p className="mt-3 text-sm text-text-muted leading-relaxed">
          创建你的数字生命，让记忆生根发芽
        </p>
      </div>

      {/* Liquid Glass Card */}
      <GlassLayer intensity="strong" className="p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <Input
              label="昵称"
              type="text"
              placeholder="你想被怎样称呼？"
              icon={User}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              error={errors.nickname}
              autoComplete="nickname"
              disabled={loading}
            />

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
                placeholder="至少 8 位，包含字母和数字"
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-8 text-text-muted transition-colors hover:text-text"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="flex items-center gap-4">
                <StrengthCheck label="至少 8 位" passed={hasLength} />
                <StrengthCheck label="包含字母" passed={hasLetter} />
                <StrengthCheck label="包含数字" passed={hasNumber} />
              </div>
            )}

            {submitError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error"
              >
                {submitError}
              </motion.div>
            )}

            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                type="submit"
                size="lg"
                loading={loading}
                className="w-full h-12 text-base font-medium"
              >
                {!loading && <ArrowRight className="h-4 w-4" />}
                开始生长
              </Button>
            </motion.div>
          </form>

          <div className="mt-6 text-center text-sm text-text-muted">
            已有数字生命？{' '}
            <Link
              href="/login"
              className="font-medium text-accent transition-colors hover:text-accent-hover"
            >
              进入 EchoLife
            </Link>
          </div>
        </motion.div>
      </GlassLayer>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 text-center text-xs text-text-subtle"
      >
        时间是树 · 记忆是叶 · 时墨是生命
      </motion.p>
    </motion.div>
  );
}

function StrengthCheck({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs transition-colors',
        passed ? 'text-success' : 'text-text-muted',
      )}
    >
      <span
        className={cn(
          'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
          passed ? 'border-success bg-success/20' : 'border-border',
        )}
      >
        {passed && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </div>
  );
}
