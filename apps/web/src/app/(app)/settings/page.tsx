"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  User,
  Settings as SettingsIcon,
  Shield,
  Bell,
  Palette,
  Globe,
  Thermometer,
  Save,
  Trash2,
  Check,
  Camera,
  ArrowRight,
  Lock,
} from "lucide-react";
import useSWR from "swr";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { FullScreenLoader } from "@/components/ui/loading";
import { GlassLayer } from "@/components/glass";
import { apiClient, swrFetcher, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import type { AuthUser, UserSettings } from "@/lib/types";

const springHover = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
};

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const { data: settings, mutate: mutateSettings } = useSWR<UserSettings>(
    "/users/me/settings",
    swrFetcher,
  );

  const [profile, setProfile] = React.useState({
    nickname: "",
    bio: "",
    avatarUrl: "",
    birthDate: "",
    gender: "",
    location: "",
    occupation: "",
  });
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileSaved, setProfileSaved] = React.useState(false);

  const [settingsState, setSettingsState] = React.useState<UserSettings | null>(
    null,
  );
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [settingsSaved, setSettingsSaved] = React.useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  // Sync profile from store
  React.useEffect(() => {
    if (user?.profile) {
      setProfile({
        nickname: user.profile.nickname ?? "",
        bio: user.profile.bio ?? "",
        avatarUrl: user.profile.avatarUrl ?? "",
        birthDate: user.profile.birthDate?.slice(0, 10) ?? "",
        gender: user.profile.gender ?? "",
        location: user.profile.location ?? "",
        occupation: user.profile.occupation ?? "",
      });
    }
  }, [user]);

  // Sync settings
  React.useEffect(() => {
    if (settings) {
      setSettingsState(settings);
    }
  }, [settings]);

  const handleSaveProfile = async () => {
    if (!profile.nickname.trim()) return;
    setProfileLoading(true);
    setProfileSaved(false);
    try {
      const updated = await apiClient.put<AuthUser>("/users/me", {
        nickname: profile.nickname.trim(),
        bio: profile.bio.trim() || undefined,
        avatarUrl: profile.avatarUrl.trim() || undefined,
        birthDate: profile.birthDate || undefined,
        gender: profile.gender || undefined,
        location: profile.location.trim() || undefined,
        occupation: profile.occupation.trim() || undefined,
      });
      updateUser(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsState) return;
    setSettingsLoading(true);
    setSettingsSaved(false);
    try {
      const updated = await apiClient.put<UserSettings>(
        "/users/me/settings",
        settingsState,
      );
      await mutateSettings(updated, false);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await apiClient.delete("/users/me");
      await logout();
      router.push("/login");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  const isAdmin =
    user?.roles?.some((r) => r === "super_admin" || r === "operator") ?? false;

  if (!user) {
    return <FullScreenLoader />;
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-bold text-text">设置</h1>

        {/* Profile section */}
        <Section icon={User} title="个人资料" description="管理你的个人信息">
          {/* Avatar */}
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <GlassLayer asChild intensity="strong">
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  transition={springHover}
                  className="glow-accent flex h-20 w-20 items-center justify-center rounded-full p-1"
                >
                  <Avatar
                    src={profile.avatarUrl || null}
                    name={profile.nickname}
                    size="xl"
                  />
                </motion.div>
              </GlassLayer>
              <button
                aria-label="更换头像"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-surface-hover text-text-muted transition-colors hover:text-accent"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-text">
                {profile.nickname || "未设置"}
              </p>
              <p className="text-xs text-text-muted">{user.email}</p>
              <Input
                label="头像 URL"
                placeholder="头像 URL（可选）"
                value={profile.avatarUrl}
                onChange={(e) =>
                  setProfile({ ...profile, avatarUrl: e.target.value })
                }
                className="mt-2 h-9 text-xs"
                wrapperClassName="w-64"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="昵称"
              value={profile.nickname}
              onChange={(e) =>
                setProfile({ ...profile, nickname: e.target.value })
              }
              placeholder="你的称呼"
            />
            <Input
              label="职业"
              value={profile.occupation}
              onChange={(e) =>
                setProfile({ ...profile, occupation: e.target.value })
              }
              placeholder="例如：设计师"
            />
            <Input
              label="所在地"
              value={profile.location}
              onChange={(e) =>
                setProfile({ ...profile, location: e.target.value })
              }
              placeholder="例如：上海"
            />
            <Input
              label="生日"
              type="date"
              value={profile.birthDate}
              onChange={(e) =>
                setProfile({ ...profile, birthDate: e.target.value })
              }
              className="[color-scheme:dark]"
            />
            <Select
              label="性别"
              value={profile.gender}
              onChange={(e) =>
                setProfile({ ...profile, gender: e.target.value })
              }
              options={[
                { value: "", label: "不愿透露" },
                { value: "male", label: "男" },
                { value: "female", label: "女" },
                { value: "other", label: "其他" },
              ]}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="个人简介"
                value={profile.bio}
                onChange={(e) =>
                  setProfile({ ...profile, bio: e.target.value })
                }
                placeholder="介绍一下你自己..."
                rows={3}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={handleSaveProfile}
              loading={profileLoading}
              className="gap-2"
            >
              {!profileLoading && <Save className="h-4 w-4" />}
              保存资料
            </Button>
            {profileSaved && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-sm text-success"
              >
                <Check className="h-4 w-4" />
                已保存
              </motion.span>
            )}
          </div>
        </Section>

        {/* Settings section */}
        <Section
          icon={SettingsIcon}
          title="偏好设置"
          description="自定义你的使用体验"
        >
          {!settingsState ? (
            <div className="space-y-4">
              <div className="skeleton h-12 rounded-xl" />
              <div className="skeleton h-12 rounded-xl" />
              <div className="skeleton h-12 rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Theme */}
              <SettingRow
                icon={Palette}
                label="主题"
                description="选择界面外观"
              >
                <div className="flex gap-2">
                  {(
                    [
                      { value: "dark", label: "深色" },
                      { value: "light", label: "浅色" },
                      { value: "auto", label: "跟随系统" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setSettingsState({ ...settingsState, theme: opt.value })
                      }
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs transition-[color,background-color,border-color] focus-ring",
                        settingsState.theme === opt.value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-text-muted hover:text-text hover:bg-surface/40",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Language */}
              <SettingRow icon={Globe} label="语言" description="界面显示语言">
                <Select
                  value={settingsState.language}
                  onChange={(e) =>
                    setSettingsState({
                      ...settingsState,
                      language: e.target.value as UserSettings["language"],
                    })
                  }
                  options={[
                    { value: "zh-CN", label: "简体中文" },
                    { value: "en-US", label: "English" },
                  ]}
                />
              </SettingRow>

              {/* Notifications */}
              <SettingRow
                icon={Bell}
                label="邮件通知"
                description="接收邮件提醒"
              >
                <Switch
                  checked={settingsState.notificationEmail}
                  onCheckedChange={(v) =>
                    setSettingsState({ ...settingsState, notificationEmail: v })
                  }
                />
              </SettingRow>
              <SettingRow
                icon={Bell}
                label="推送通知"
                description="接收应用内推送"
              >
                <Switch
                  checked={settingsState.notificationPush}
                  onCheckedChange={(v) =>
                    setSettingsState({ ...settingsState, notificationPush: v })
                  }
                />
              </SettingRow>

              {/* AI temperature */}
              <GlassLayer asChild intensity="default">
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-text-muted" />
                      <span className="text-sm font-medium text-text">
                        AI 温度
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-accent">
                      {settingsState.aiTemperature.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    控制 AI 回复的创造力，数值越低越稳定，越高越多样
                  </p>
                  <GlassLayer asChild intensity="subtle">
                    <div className="px-4 py-2">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={settingsState.aiTemperature}
                        onChange={(e) =>
                          setSettingsState({
                            ...settingsState,
                            aiTemperature: parseFloat(e.target.value),
                          })
                        }
                        aria-label="AI 温度"
                        className="w-full accent-accent"
                        style={{
                          appearance: "auto" as const,
                        }}
                      />
                    </div>
                  </GlassLayer>
                  <div className="flex justify-between text-3xs text-text-muted">
                    <span>稳定</span>
                    <span>平衡</span>
                    <span>创造</span>
                  </div>
                </div>
              </GlassLayer>

              {/* Memory retention */}
              <SettingRow
                icon={SettingsIcon}
                label="记忆保留天数"
                description="AI 访谈上下文记忆保留时长"
              >
                <Select
                  value={String(settingsState.memoryRetentionDays)}
                  onChange={(e) =>
                    setSettingsState({
                      ...settingsState,
                      memoryRetentionDays: parseInt(e.target.value, 10),
                    })
                  }
                  options={[
                    { value: "7", label: "7 天" },
                    { value: "30", label: "30 天" },
                    { value: "90", label: "90 天" },
                    { value: "365", label: "1 年" },
                    { value: "0", label: "永久" },
                  ]}
                />
              </SettingRow>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSaveSettings}
                  loading={settingsLoading}
                  className="gap-2"
                >
                  {!settingsLoading && <Save className="h-4 w-4" />}
                  保存设置
                </Button>
                {settingsSaved && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-1 text-sm text-success"
                  >
                    <Check className="h-4 w-4" />
                    已保存
                  </motion.span>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Admin console entrance (admin only) */}
        {isAdmin && (
          <Section icon={Lock} title="系统管理" description="AI 接入与运维配置">
            <GlassLayer asChild intensity="default" interactive>
              <Link
                href="/admin"
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface/40 focus-ring"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
                    <Shield className="h-4 w-4 text-accent" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-text">进入系统管理</p>
                    <p className="text-xs text-text-muted">
                      管理 API Key、Provider 与后台配置
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-text-muted" />
              </Link>
            </GlassLayer>
          </Section>
        )}

        {/* Security section */}
        <Section icon={Shield} title="安全" description="账户安全与隐私">
          <div className="space-y-3">
            <GlassLayer asChild intensity="default" interactive>
              <motion.button
                onClick={() => setPasswordModalOpen(true)}
                whileHover={{ y: -2, scale: 1.005 }}
                transition={springHover}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface/40">
                    <Lock className="h-4 w-4 text-text-muted" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-text">修改密码</p>
                    <p className="text-xs text-text-muted">
                      定期更新密码更安全
                    </p>
                  </div>
                </div>
              </motion.button>
            </GlassLayer>

            <motion.button
              onClick={() => setDeleteModalOpen(true)}
              whileHover={{ y: -2, scale: 1.005 }}
              transition={springHover}
              className="flex w-full items-center justify-between rounded-2xl border border-error/20 bg-error/[0.04] p-4 text-left transition-colors hover:bg-error/[0.08]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-error/10">
                  <Trash2 className="h-4 w-4 text-error" />
                </span>
                <div>
                  <p className="text-sm font-medium text-error">删除账户</p>
                  <p className="text-xs text-text-muted">
                    永久删除你的账号和所有数据
                  </p>
                </div>
              </div>
            </motion.button>
          </div>
        </Section>

      </div>

      {/* Change password modal */}
      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />

      {/* Delete account modal */}
      <DeleteAccountModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </PageTransition>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Icon className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <p className="text-xs text-text-muted">{description}</p>
          </div>
        </div>
        {children}
      </motion.div>
    </GlassLayer>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <GlassLayer asChild intensity="default">
      <motion.div
        whileHover={{ y: -1, scale: 1.002 }}
        transition={springHover}
        className="flex items-center justify-between gap-4 p-4"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text">{label}</p>
            <p className="text-xs text-text-muted">{description}</p>
          </div>
        </div>
        {children}
      </motion.div>
    </GlassLayer>
  );
}

function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!current || !next || !confirm) {
      setError("请填写所有字段");
      return;
    }
    if (next.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (next !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "修改失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="修改密码"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            确认修改
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="当前密码"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <Input
          label="新密码"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          hint="至少 8 位"
        />
        <Input
          label="确认新密码"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const canConfirm = confirmText === "删除我的账号";

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="删除账户"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            loading={loading}
            disabled={!canConfirm}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            永久删除
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <GlassLayer asChild intensity="default">
          <div className="border-error/20 bg-error/[0.06] p-4">
            <p className="text-sm font-medium text-error">此操作不可撤销</p>
            <p className="mt-1 text-xs text-text-muted">
              删除后，你的所有记忆、访谈、时间胶囊和个人数据将被永久清除，无法恢复。
            </p>
          </div>
        </GlassLayer>
        <p className="text-sm text-text-muted">
          请输入 <span className="font-semibold text-text">删除我的账号</span>{" "}
          以确认：
        </p>
        <Input
          label="确认删除账号"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="删除我的账号"
        />
      </div>
    </Modal>
  );
}
