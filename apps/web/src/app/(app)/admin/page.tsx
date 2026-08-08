"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  KeyRound,
  Cpu,
  Zap,
  Save,
  Trash2,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowLeft,
  Lock,
} from "lucide-react";
import useSWR from "swr";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GlassLayer } from "@/components/glass";
import { apiClient, swrFetcher, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { FullScreenLoader } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

const springHover = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
};

/* ═══════════════════════════════════════════════════════════
 * Admin Console — 系统管理
 *
 * 把 API Key / Provider 等运维功能从家庭-facing 的设置页隔离出来，
 * 保持主应用的温暖、克制与家庭氛围。
 * ═══════════════════════════════════════════════════════════ */

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const isAdmin =
    user?.roles?.some((r) => r === "super_admin" || r === "operator") ?? false;

  // 客户端角色守卫：非 admin 用户重定向到首页
  React.useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/");
    }
  }, [user, isAdmin, router]);

  // 角色未确定前显示加载状态
  if (!user || !isAdmin) {
    return <FullScreenLoader />;
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface/40 hover:text-text focus-ring"
            aria-label="返回设置"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-text">系统管理</h1>
            <p className="text-xs text-text-muted">AI 接入、Provider 与运维配置</p>
          </div>
        </div>

        {/* API Key Management */}
        <ApiKeyManagement />

        {/* Security notice */}
        <GlassLayer asChild intensity="default">
          <div className="mt-6 flex items-start gap-3 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div className="text-xs leading-relaxed text-text-muted">
              <p>此页面仅对管理员可见，所有 API Key 使用 AES-256-GCM 加密后存储。</p>
              <p className="mt-1">
                加密密钥通过环境变量{" "}
                <code className="rounded bg-surface/40 px-1 py-0.5">ENCRYPTION_KEY</code>{" "}
                配置，请妥善保管。
              </p>
            </div>
          </div>
        </GlassLayer>
      </div>
    </PageTransition>
  );
}

/* ============================================================
 * API Key Management
 * ============================================================ */

interface ProviderStatus {
  provider: string;
  label: string;
  configured: boolean;
  source: string;
  masked: string;
  supportsEmbedding: boolean;
}

interface ApiKeyStatusResponse {
  providers: ProviderStatus[];
  activeProvider: string;
}

function ApiKeyManagement() {
  const { data, mutate, isLoading } = useSWR<ApiKeyStatusResponse>(
    "/api-keys",
    swrFetcher,
  );
  const [editingProvider, setEditingProvider] = React.useState<string | null>(
    null,
  );
  const [keyInput, setKeyInput] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<
    Record<string, { success: boolean; message: string } | null>
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [savedProvider, setSavedProvider] = React.useState<string | null>(null);
  const [deletingProvider, setDeletingProvider] = React.useState<string | null>(
    null,
  );
  /** 跟踪 savedProvider 的 setTimeout，组件卸载时清除 */
  const savedProviderTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (savedProviderTimerRef.current) clearTimeout(savedProviderTimerRef.current);
    };
  }, []);

  const providers = data?.providers ?? [];
  const activeProvider = data?.activeProvider ?? "glm";

  const handleSave = async (provider: string) => {
    if (!keyInput.trim()) {
      setError("API Key 不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(`/api-keys/${provider}`, { apiKey: keyInput.trim() });
      setSavedProvider(provider);
      setKeyInput("");
      setEditingProvider(null);
      setShowKey(false);
      await mutate();
      if (savedProviderTimerRef.current) clearTimeout(savedProviderTimerRef.current);
      savedProviderTimerRef.current = setTimeout(() => setSavedProvider(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (provider: string) => {
    setDeletingProvider(provider);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProvider) return;
    const provider = deletingProvider;
    setDeletingProvider(null);
    try {
      await apiClient.delete(`/api-keys/${provider}`);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  const handleTest = async (provider: string) => {
    setTesting(provider);
    try {
      const result = await apiClient.post<{
        success: boolean;
        message: string;
        latencyMs: number;
      }>(`/api-keys/${provider}/test`);
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          success: result.success,
          message: `${result.message} (${result.latencyMs}ms)`,
        },
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [provider]: {
          success: false,
          message: err instanceof ApiError ? err.message : "测试失败",
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleSwitchProvider = async (provider: string) => {
    try {
      await apiClient.put(`/api-keys/active/${provider}`);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "切换失败");
    }
  };

  const providerIcons: Record<
    string,
    React.ComponentType<{ className?: string }>
  > = {
    glm: Cpu,
    deepseek: Zap,
    openai: Cpu,
    qwen: Cpu,
  };

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <KeyRound className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">AI 接入管理</h2>
            <p className="text-xs text-text-muted">
              管理各 AI 服务商的 API Key（AES-256-GCM 加密存储）
            </p>
          </div>
        </div>

        {error && (
          <GlassLayer asChild intensity="default">
            <div className="mb-4 flex items-center gap-2 border-error/20 bg-error/[0.06] p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-error" />
              <span className="text-sm text-error">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-xs text-text-muted hover:text-text focus-ring"
                aria-label="清除错误"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </GlassLayer>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active provider indicator */}
            <GlassLayer asChild intensity="default">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <Zap className="h-4 w-4 text-accent" />
                  </span>
                  <div>
                    <p className="text-xs text-text-muted">当前活跃 Provider</p>
                    <p className="text-sm font-semibold text-accent">
                      {activeProvider.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
            </GlassLayer>

            {providers.map((p) => {
              const Icon = providerIcons[p.provider] ?? Cpu;
              const isActive = p.provider === activeProvider;
              const isEditing = editingProvider === p.provider;

              return (
                <GlassLayer asChild intensity="default" key={p.provider}>
                  <motion.div
                    whileHover={{ y: -1, scale: 1.002 }}
                    transition={springHover}
                    className={cn(
                      "p-4 transition-[background-color,border-color,box-shadow]",
                      isActive && "ring-1 ring-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl",
                            p.configured ? "bg-success/10" : "bg-surface/40",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              p.configured ? "text-success" : "text-text-muted",
                            )}
                          />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-text">
                              {p.label}
                            </p>
                            {isActive && (
                              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-3xs font-medium text-accent">
                                活跃
                              </span>
                            )}
                            {p.configured && (
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-3xs text-success">
                                已配置
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {p.configured
                              ? `${p.masked} · 来源: ${p.source === "database" ? "数据库(加密)" : p.source === "env" ? "环境变量" : "未配置"}`
                              : "未配置"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {p.configured && !isActive && (
                          <button
                            onClick={() => handleSwitchProvider(p.provider)}
                            className="rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface/40 hover:text-accent focus-ring"
                            title="设为活跃"
                          >
                            切换
                          </button>
                        )}
                        {p.configured && (
                          <button
                            onClick={() => handleTest(p.provider)}
                            disabled={testing === p.provider}
                            className="rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface/40 hover:text-info disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
                          >
                            {testing === p.provider ? "测试中..." : "测试"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingProvider(isEditing ? null : p.provider);
                            setKeyInput("");
                            setShowKey(false);
                            setError(null);
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface/40 hover:text-text focus-ring"
                        >
                          {isEditing ? "取消" : p.configured ? "更新" : "配置"}
                        </button>
                        {p.configured && (
                          <button
                            onClick={() => handleDeleteRequest(p.provider)}
                            className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-error/10 hover:text-error focus-ring"
                            aria-label={`删除 ${p.label} 的 API Key`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Test result */}
                    {testResult[p.provider] && (
                      <div
                        className={cn(
                          "mt-2 rounded-lg px-3 py-2 text-xs",
                          testResult[p.provider]!.success
                            ? "bg-success/10 text-success"
                            : "bg-error/10 text-error",
                        )}
                      >
                        {testResult[p.provider]!.message}
                      </div>
                    )}

                    {/* Saved indicator */}
                    {savedProvider === p.provider && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-success">
                        <Check className="h-3 w-3" /> 已保存
                      </div>
                    )}

                    {/* Edit input */}
                    {isEditing && (
                      <div className="mt-3 space-y-2">
                        <div className="relative">
                          <Input
                            label="API Key"
                            type={showKey ? "text" : "password"}
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            placeholder={`输入 ${p.label} 的 API Key`}
                            autoComplete="off"
                          />
                          <button
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text focus-ring"
                            type="button"
                            aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                          >
                            {showKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSave(p.provider)}
                            loading={saving}
                            className="gap-1.5"
                          >
                            {!saving && <Save className="h-3.5 w-3.5" />}
                            加密保存
                          </Button>
                          <span className="text-3xs text-text-muted">
                            AES-256-GCM 加密后存储
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </GlassLayer>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Delete confirmation modal */}
      <DeleteConfirmModal
        provider={
          deletingProvider
            ? providers.find((p) => p.provider === deletingProvider) ?? null
            : null
        }
        open={deletingProvider !== null}
        onClose={() => setDeletingProvider(null)}
        onConfirm={handleConfirmDelete}
      />
    </GlassLayer>
  );
}

function DeleteConfirmModal({
  provider,
  open,
  onClose,
  onConfirm,
}: {
  provider: ProviderStatus | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="删除 API Key"
      description={
        provider
          ? `确认删除 ${provider.label} 的 API Key？删除后该 Provider 将回到未配置状态。`
          : "确认删除该 API Key？"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            loading={loading}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            确认删除
          </Button>
        </>
      }
    >
      <GlassLayer asChild intensity="default">
        <div className="border-error/20 bg-error/[0.06] p-4">
          <p className="text-sm font-medium text-error">此操作不可撤销</p>
          <p className="mt-1 text-xs text-text-muted">
            删除后如果需要重新使用 {provider?.label ?? "该 Provider"}，需要重新配置 API Key。
          </p>
        </div>
      </GlassLayer>
    </Modal>
  );
}
