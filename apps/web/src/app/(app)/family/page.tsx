'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Plus,
  LogIn,
  UserPlus,
  LogOut,
  Share2,
  Check,
  X,
  Clock,
  BookOpen,
  Bell,
  AlertCircle,
  Heart,
  Shield,
  ShoppingBag,
  Pill,
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { FullScreenLoader } from '@/components/ui/loading';
import { GlassLayer } from '@/components/glass';
import { useToast } from '@/components/ui/toast';
import { apiClient, swrFetcher, ApiError } from '@/lib/api-client';
import { cn, formatDate, formatRelativeTime, getInitials } from '@/lib/utils';
import type { Family, FamilyMemory, Memory, PaginatedResponse } from '@echolife/shared';

const FAMILY_ID_KEY = 'echolife_current_family_id';

function getCurrentFamilyId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(FAMILY_ID_KEY);
}

function setCurrentFamilyId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(FAMILY_ID_KEY, id);
  else window.localStorage.removeItem(FAMILY_ID_KEY);
}

const springHover = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 25,
};

export default function FamilyPage() {
  const [familyId, setFamilyId] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [autoDetecting, setAutoDetecting] = React.useState(false);
  // R3-FE-011: Replace alert/confirm with toast and state-based modal.
  const { toast, Toaster } = useToast();
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  React.useEffect(() => {
    const stored = getCurrentFamilyId();
    if (stored) {
      setFamilyId(stored);
      setHydrated(true);
      return;
    }
    setAutoDetecting(true);
    swrFetcher<{ families: Array<{ id: string }> }>('/families')
      .then((res) => {
        if (res.families && res.families.length > 0) {
          const firstId = res.families[0].id;
          setCurrentFamilyId(firstId);
          setFamilyId(firstId);
        }
      })
      .catch(() => {})
      .finally(() => {
        setAutoDetecting(false);
        setHydrated(true);
      });
  }, []);

  const { data: family, mutate, isLoading } = useSWR<Family>(
    familyId ? `/families/${familyId}` : null,
    swrFetcher,
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);

  if (!hydrated || autoDetecting) {
    return <FullScreenLoader label="正在查找你的家庭..." />;
  }

  if (!familyId) {
    return (
      <PageTransition>
        <div
          className="w-full min-h-screen px-4 sm:px-8 lg:px-16 py-8 sm:py-10"
          style={{
            paddingBottom:
              'calc(var(--home-mobile-dock-clearance) + var(--safe-bottom) + var(--space-2xl))',
          }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Hero Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8 sm:mb-10"
            >
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-accent" aria-hidden="true" />
                <span className="text-xs text-text-muted">家庭空间</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-semibold text-text tracking-tight mb-1">
                家庭记忆
              </h1>
              <p className="text-sm text-text-muted">
                与家人共同守护属于你们的回忆
              </p>
            </motion.div>

            {/* Empty State Card */}
            <GlassLayer
              asChild
              intensity="strong"
              className="relative flex flex-col items-center justify-center overflow-hidden py-16 sm:py-20 text-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-sm mx-auto px-6"
              >
                {/* Ambient glow behind seedling */}
                <div
                  className="pointer-events-none absolute top-0 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-8 rounded-full opacity-[0.10] blur-[60px]"
                  style={{ background: 'var(--color-primary)' }}
                />

                {/* Breathing seedling — larger, more prominent */}
                <motion.svg
                  width="96"
                  height="112"
                  viewBox="0 0 64 80"
                  fill="none"
                  className="mx-auto"
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <motion.path
                    d="M32 78 C32 60, 30 45, 28 35"
                    stroke="var(--color-highlight)"
                    strokeOpacity="0.5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <motion.path
                    d="M32 78 C32 55, 34 40, 36 30"
                    stroke="var(--color-highlight)"
                    strokeOpacity="0.4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <motion.ellipse
                    cx="22"
                    cy="32"
                    rx="10"
                    ry="6"
                    fill="var(--color-success)"
                    fillOpacity="0.35"
                    animate={{ rotate: [-5, 5, -5] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ transformOrigin: '28px 35px' }}
                  />
                  <motion.ellipse
                    cx="42"
                    cy="28"
                    rx="12"
                    ry="7"
                    fill="var(--color-success)"
                    fillOpacity="0.3"
                    animate={{ rotate: [5, -5, 5] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ transformOrigin: '36px 30px' }}
                  />
                  <motion.circle
                    cx="32"
                    cy="22"
                    r="4"
                    fill="var(--color-secondary)"
                    fillOpacity="0.25"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.circle
                    cx="32"
                    cy="40"
                    r="25"
                    fill="var(--color-success)"
                    fillOpacity="0.03"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.svg>

                {/* Text hierarchy */}
                <p className="mt-8 text-lg font-medium text-text">还没有加入家庭</p>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  创建一个家庭组，邀请家人加入，共同记录和分享珍贵的家庭记忆。
                </p>

                {/* Action buttons — larger, more prominent */}
                <div className="mt-8 flex flex-col gap-3">
                  <Button
                    onClick={() => setCreateOpen(true)}
                    size="lg"
                    className="gap-2 w-full"
                  >
                    <Plus className="h-4 w-4" />
                    创建家庭
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setJoinOpen(true)}
                    size="lg"
                    className="gap-2 w-full"
                  >
                    <LogIn className="h-4 w-4" />
                    加入家庭
                  </Button>
                </div>
              </motion.div>
            </GlassLayer>
          </div>

          <CreateFamilyModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={(id) => {
              setCurrentFamilyId(id);
              setFamilyId(id);
              setCreateOpen(false);
              void mutate();
            }}
          />
          <JoinFamilyModal
            open={joinOpen}
            onClose={() => setJoinOpen(false)}
            onJoined={(id) => {
              setCurrentFamilyId(id);
              setFamilyId(id);
              setJoinOpen(false);
              void mutate();
            }}
          />
        </div>
      </PageTransition>
    );
  }

  if (isLoading && !family) {
    return <FullScreenLoader label="加载家庭信息中..." />;
  }

  return (
    <PageTransition>
      <div
        className="w-full min-h-screen px-4 sm:px-8 lg:px-16 py-8 sm:py-10"
        style={{
          paddingBottom:
            'calc(var(--home-mobile-dock-clearance) + var(--safe-bottom) + var(--space-2xl))',
        }}
      >
        <div className="max-w-5xl mx-auto">
          {/* Hero Header — 与空状态统一设计语言 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 sm:mb-10"
          >
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-accent" aria-hidden="true" />
              <span className="text-xs text-text-muted">家庭空间</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-text tracking-tight mb-1 truncate">
                  {family?.name ?? '家庭记忆'}
                </h1>
                <p className="text-sm text-text-muted">
                  {family?.memberCount ?? 0} 位成员 · 与家人共享回忆
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setShowLeaveConfirm(true)}
                className="gap-2 text-error hover:bg-error/10 shrink-0"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">离开家庭</span>
              </Button>
            </div>
          </motion.div>

          <FamilyDetail familyId={familyId} />
        </div>
      </div>

      {/* R3-FE-011: State-based confirmation modal replacing window.confirm */}
      <Modal
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        title="离开家庭"
      >
        <p className="text-sm text-text-muted mb-6">
          确定离开这个家庭吗？离开后将无法控制该家庭下的设备。
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setShowLeaveConfirm(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            className="bg-error text-white hover:bg-error/90"
            onClick={async () => {
              setShowLeaveConfirm(false);
              try {
                await apiClient.delete(`/families/${familyId}/leave`);
                setCurrentFamilyId(null);
                setFamilyId(null);
              } catch (err) {
                toast({
                  type: 'error',
                  message: err instanceof ApiError ? err.message : '操作失败',
                });
              }
            }}
          >
            确定离开
          </Button>
        </div>
      </Modal>

      {Toaster}
    </PageTransition>
  );
}

function FamilyDetail({ familyId }: { familyId: string }) {
  const { data: membersData, isLoading: membersLoading } = useSWR<{ items: FamilyMemberRaw[] }>(
    `/families/${familyId}/members`,
    swrFetcher,
  );
  const { data: memoriesData, mutate: mutateMemories } = useSWR<PaginatedResponse<FamilyMemory>>(
    `/families/${familyId}/memories?pageSize=50`,
    swrFetcher,
  );

  // R3-FE-011: Replace alert() with toast notifications.
  const { toast, Toaster } = useToast();
  const [shareOpen, setShareOpen] = React.useState(false);
  const members = membersData?.items ?? [];
  const sharedMemories = memoriesData?.items ?? [];

  const handleConfirm = async (id: string) => {
    try {
      await apiClient.post(`/families/memories/${id}/confirm`);
      await mutateMemories();
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof ApiError ? err.message : '操作失败',
      });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiClient.post(`/families/memories/${id}/reject`);
      await mutateMemories();
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof ApiError ? err.message : '操作失败',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 时墨督促提醒 */}
      <SupervisionSection />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
      {/* Members */}
      <GlassLayer
        asChild
        intensity="default"
        className="p-5 sm:p-6 lg:col-span-1"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5 flex items-center gap-2">
            <Users className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text">家庭成员</h2>
            <Badge variant="outline">{members.length}</Badge>
          </div>
          {membersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="h-8 w-8 text-text-muted opacity-40" />
              <p className="mt-3 text-sm text-text-muted">暂无其他成员</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {members.filter((m) => m?.id).map((m) => (
                <GlassLayer
                  asChild
                  intensity="default"
                  className="flex items-center gap-3 px-4 py-3 min-h-12"
                  key={m.id}
                >
                  <motion.div
                    whileHover={{ y: -2, scale: 1.01 }}
                    transition={springHover}
                  >
                    <Avatar src={m.avatarUrl ?? undefined} name={m.nickname || '未知'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{m.nickname || '未知成员'}</p>
                      <p className="text-xs text-text-muted">
                        {m.joinedAt ? `${formatRelativeTime(m.joinedAt)} 加入` : '加入时间未知'}
                      </p>
                    </div>
                    <Badge variant={m.role === 'admin' ? 'accent' : 'default'}>
                      {m.role === 'admin' ? '管理员' : '成员'}
                    </Badge>
                  </motion.div>
                </GlassLayer>
              ))}
            </div>
          )}
        </motion.div>
      </GlassLayer>

      {/* Shared memories */}
      <GlassLayer
        asChild
        intensity="default"
        className="p-5 sm:p-6 lg:col-span-2"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text">共享记忆</h2>
              <Badge variant="outline">{sharedMemories.length}</Badge>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)} className="gap-1.5">
              <Share2 className="h-3.5 w-3.5" />
              分享记忆
            </Button>
          </div>

          {sharedMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-0 rounded-full opacity-[0.08] blur-[40px]"
                  style={{ background: 'var(--color-primary)' }}
                />
                <Share2 className="relative h-10 w-10 text-text-muted opacity-50" />
              </div>
              <p className="mt-4 text-sm font-medium text-text">还没有共享的记忆</p>
              <p className="mt-1.5 text-xs text-text-muted leading-relaxed max-w-xs">
                将你的记忆分享给家人，共同珍藏美好时光
              </p>
            </div>
          ) : (
            <StaggerContainer className="space-y-2.5">
              {sharedMemories.map((sm) => (
                <StaggerItem key={sm.id}>
                  <SharedMemoryRow
                    shared={sm}
                    onConfirm={() => handleConfirm(sm.id)}
                    onReject={() => handleReject(sm.id)}
                  />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </motion.div>
      </GlassLayer>
      </div>

      <ShareMemoryModal
        familyId={familyId}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => {
          setShareOpen(false);
          void mutateMemories();
        }}
      />
      {Toaster}
    </div>
  );
}

interface FamilyMemberRaw {
  id: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

const confirmationLabels: Record<string, { label: string; className: string }> = {
  pending: { label: '待确认', className: 'border-highlight/30 bg-highlight/10 text-highlight' },
  confirmed: { label: '已确认', className: 'border-success/30 bg-success/10 text-success' },
  rejected: { label: '已拒绝', className: 'border-error/30 bg-error/10 text-error' },
};

function SharedMemoryRow({
  shared,
  onConfirm,
  onReject,
}: {
  shared: FamilyMemory;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const status = confirmationLabels[shared.confirmationStatus] ?? {
    label: shared.confirmationStatus,
    className: 'border-border bg-surface text-text-muted',
  };
  const isPending = shared.confirmationStatus === 'pending';

  return (
    <GlassLayer
      asChild
      intensity="default"
      className="flex items-center gap-3 px-4 py-3.5 min-h-14"
    >
      <motion.div
        whileHover={{ y: -2, scale: 1.005 }}
        transition={springHover}
        className="w-full"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-text">
              记忆 #{(shared.memoryId ?? 'unknown').slice(0, 8)}
            </p>
            <Badge className={status.className}>{status.label}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="h-3 w-3" />
            {formatDate(shared.createdAt)}
          </div>
        </div>
        {isPending && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="primary" onClick={onConfirm} className="gap-1">
              <Check className="h-3.5 w-3.5" />
              确认
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} className="gap-1 text-error">
              <X className="h-3.5 w-3.5" />
              拒绝
            </Button>
          </div>
        )}
      </motion.div>
    </GlassLayer>
  );
}

function CreateFamilyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('请输入家庭名称');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const family = await apiClient.post<Family>('/families', {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(family.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="创建家庭"
      description="创建一个新的家庭组，你将成为管理员"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="家庭名称"
          placeholder="例如：温馨之家"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
        />
        <Input
          label="简介（可选）"
          placeholder="描述你的家庭..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function JoinFamilyModal({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const [inviteCode, setInviteCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setInviteCode('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const family = await apiClient.post<Family>('/families/join', {
        inviteCode: inviteCode.trim(),
      });
      onJoined(family.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="加入家庭"
      description="输入家人分享的邀请码"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading} className="gap-2">
            <UserPlus className="h-4 w-4" />
            加入
          </Button>
        </>
      }
    >
      <Input
        label="邀请码"
        placeholder="输入邀请码..."
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        error={error ?? undefined}
      />
    </Modal>
  );
}

function ShareMemoryModal({
  familyId,
  open,
  onClose,
  onShared,
}: {
  familyId: string;
  open: boolean;
  onClose: () => void;
  onShared: () => void;
}) {
  const { data, isLoading } = useSWR<PaginatedResponse<Memory>>(
    '/memories?pageSize=20',
    swrFetcher,
  );
  const memories = data?.items ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSelected(null);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!selected) {
      setError('请选择一条记忆');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/families/${familyId}/memories`, { memoryId: selected });
      onShared();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '分享失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="分享记忆"
      description="选择一条记忆分享给家人"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!selected}>
            分享
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            你还没有可分享的记忆
          </p>
        ) : (
          memories.map((memory) => (
            <motion.button
              key={memory.id}
              onClick={() => setSelected(memory.id)}
              whileHover={{ y: -2, scale: 1.005 }}
              transition={springHover}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                selected === memory.id
                  ? 'border-accent bg-accent/10'
                  : 'border-transparent bg-[var(--color-gray-950)] hover:bg-[var(--color-gray-900)]',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-gray-900)] text-xs font-semibold text-text-muted">
                {getInitials(memory.title)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{memory.title}</p>
                <p className="line-clamp-1 text-xs text-text-muted">{memory.content}</p>
              </div>
              {selected === memory.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </motion.button>
          ))
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}

// ============================================================
// 时墨督促提醒区域
// ============================================================

interface Supervision {
  id: string;
  familyMember: { name: string; role: string; avatar: string };
  type: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'resolved' | 'snoozed';
  sourceDevice?: string;
  suggestedAction: string;
  createdAt: string;
  dueAt?: string;
}

const SUPERVISION_TYPE_META: Record<string, { icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  medication_reminder: { icon: Pill, color: 'var(--color-error)', label: '用药提醒' },
  homework_reminder: { icon: BookOpen, color: 'var(--color-info)', label: '学习提醒' },
  grocery_reminder: { icon: ShoppingBag, color: 'var(--color-warning)', label: '食材提醒' },
  safety_check: { icon: Shield, color: 'var(--color-error)', label: '安全检查' },
  health_check: { icon: Heart, color: 'var(--color-accent)', label: '健康关怀' },
  schedule_reminder: { icon: Clock, color: 'var(--color-text-muted)', label: '日程提醒' },
};

const PRIORITY_STYLE: Record<string, string> = {
  high: 'border-error/30 bg-error/[0.06]',
  medium: 'border-warning/20 bg-warning/[0.04]',
  low: 'border-transparent bg-[rgba(255,255,255,0.03)]',
};

function SupervisionSection() {
  const { data, mutate } = useSWR<{ supervisions: Supervision[] }>(
    '/families/supervisions',
    swrFetcher,
    { refreshInterval: 10000 },
  );
  const [resolving, setResolving] = React.useState<string | null>(null);

  const supervisions = data?.supervisions ?? [];
  const activeCount = supervisions.filter((s) => s.status === 'active').length;

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await apiClient.post(`/families/supervisions/${id}/resolve`);
      await mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    } finally {
      setResolving(null);
    }
  };

  if (activeCount === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <GlassLayer asChild intensity="default" className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
              <Check className="h-4 w-4 text-success" />
            </span>
            <div>
              <p className="text-sm font-medium text-text">家人一切安好</p>
              <p className="text-xs text-text-muted">时墨正在守护家庭，暂无需要关注的事项</p>
            </div>
          </div>
        </GlassLayer>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell size={15} className="text-accent" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text">时墨督促提醒</h2>
        <Badge variant="accent">{activeCount}</Badge>
        <span className="text-xs text-text-subtle">时墨以家长身份关注家人</span>
      </div>

      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {supervisions.filter((s) => s.status === 'active').map((sup) => {
          const meta = SUPERVISION_TYPE_META[sup.type] ?? { icon: AlertCircle, color: 'var(--color-text-muted)', label: '提醒' };
          const Icon = meta.icon;
          return (
            <StaggerItem key={sup.id}>
              <GlassLayer
                asChild
                intensity="default"
                className={cn('p-4 border', PRIORITY_STYLE[sup.priority])}
              >
                <motion.div whileHover={{ y: -2 }} transition={springHover}>
                  <div className="flex items-start gap-3 mb-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `color-mix(in srgb, ${meta.color}, transparent 88%)` }}
                    >
                      <Icon size={14} style={{ color: meta.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-lg">{sup.familyMember.avatar}</span>
                        <p className="text-sm font-medium text-text truncate">{sup.title}</p>
                      </div>
                      <p className="text-xs text-text-muted line-clamp-2">{sup.description}</p>
                    </div>
                    {sup.priority === 'high' && (
                      <span className="flex items-center gap-0.5 shrink-0 text-xs text-error">
                        <AlertCircle size={10} />
                        紧急
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-text-subtle">
                      <span>{sup.familyMember.name}</span>
                      <span>·</span>
                      <span>{meta.label}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleResolve(sup.id)}
                      disabled={resolving === sup.id}
                      className="gap-1.5 shrink-0"
                    >
                      <Check size={12} />
                      已处理
                    </Button>
                  </div>

                  {sup.suggestedAction && (
                    <p className="mt-2 text-xs text-accent bg-accent/5 rounded-lg px-2.5 py-1.5">
                      {sup.suggestedAction}
                    </p>
                  )}
                </motion.div>
              </GlassLayer>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </motion.div>
  );
}
