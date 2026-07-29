'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Lock,
  LockOpen,
  Plus,
  Calendar,
  Trash2,
  Mail,
  Sparkles,
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CardSkeletonGrid, FullScreenLoader } from '@/components/ui/loading';
import { apiClient, swrFetcher, ApiError } from '@/lib/api-client';
import { cn, formatDate, formatDateTime, daysUntil } from '@/lib/utils';
import { capsuleStatusLabels, capsuleTypeLabels } from '@/lib/labels';
import { CapsuleStatus, type TimeCapsule, type PaginatedResponse } from '@echolife/shared';

/** Mix a CSS variable color with opacity using the design system. */
function colorMix(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

export default function CapsulesPage() {
  const { data, isLoading, mutate } = useSWR<PaginatedResponse<TimeCapsule>>(
    '/capsules?pageSize=50',
    swrFetcher,
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [openedCapsule, setOpenedCapsule] = React.useState<TimeCapsule | null>(null);
  const [opening, setOpening] = React.useState<string | null>(null);

  const capsules = data?.items ?? [];

  const handleOpen = async (capsule: TimeCapsule) => {
    if (capsule.status === CapsuleStatus.OPENED) {
      setOpenedCapsule(capsule);
      return;
    }
    // Check if it's time to open
    const remaining = daysUntil(capsule.openAt);
    if (remaining > 0) {
      setOpenedCapsule(capsule); // Show countdown/sealed state in modal
      return;
    }
    // Due - attempt to open
    setOpening(capsule.id);
    try {
      const updated = await apiClient.post<TimeCapsule>(`/capsules/${capsule.id}/open`);
      await mutate();
      setOpenedCapsule(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '开启失败');
    } finally {
      setOpening(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个时间胶囊吗？')) return;
    try {
      await apiClient.delete(`/capsules/${id}`);
      await mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  if (isLoading && !data) {
    return <FullScreenLoader label="加载时间胶囊中..." />;
  }

  const sealedCount = capsules.filter((c) => c.status !== CapsuleStatus.OPENED).length;
  const openedCount = capsules.length - sealedCount;

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">时间胶囊</h1>
          <p className="text-sm text-text-muted">
            共 {capsules.length} 个 · {sealedCount} 个封存 · {openedCount} 个已开启
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          创建胶囊
        </Button>
      </div>

      {isLoading ? (
        <CardSkeletonGrid count={4} />
      ) : capsules.length === 0 ? (
        <EmptyCapsules onCreate={() => setCreateOpen(true)} />
      ) : (
        <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capsules.map((capsule) => (
            <StaggerItem key={capsule.id}>
              <CapsuleCard
                capsule={capsule}
                onOpen={() => handleOpen(capsule)}
                onDelete={() => handleDelete(capsule.id)}
                opening={opening === capsule.id}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Create modal */}
      <CreateCapsuleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void mutate();
        }}
      />

      {/* View modal */}
      <Modal
        open={!!openedCapsule}
        onClose={() => setOpenedCapsule(null)}
        title={openedCapsule?.title}
        description={
          openedCapsule
            ? openedCapsule.status === CapsuleStatus.OPENED
              ? `已于 ${formatDate(openedCapsule.openedAt ?? openedCapsule.openAt)} 开启`
              : `将于 ${formatDate(openedCapsule.openAt)} 开启`
            : undefined
        }
      >
        {openedCapsule && <CapsuleDetail capsule={openedCapsule} />}
      </Modal>
    </PageTransition>
  );
}

function CapsuleCard({
  capsule,
  onOpen,
  onDelete,
  opening,
}: {
  capsule: TimeCapsule;
  onOpen: () => void;
  onDelete: () => void;
  opening: boolean;
}) {
  const isOpened = capsule.status === CapsuleStatus.OPENED;
  const remaining = daysUntil(capsule.openAt);
  const canOpen = !isOpened && remaining <= 0;
  const color = isOpened ? 'var(--color-apple-green)' : canOpen ? 'var(--color-apple-amber)' : 'var(--color-indigo)';

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassLayer
        intensity="subtle"
        className="relative flex h-full flex-col overflow-hidden cursor-pointer group"
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {/* Accent stripe */}
        <div className="h-1 w-full" style={{ backgroundColor: color }} />

        <div className="flex flex-1 flex-col p-5">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <motion.span
              whileHover={{ scale: 1.08 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: colorMix(color, 0.1) }}
            >
              {isOpened ? (
                <LockOpen className="h-5 w-5" style={{ color }} />
              ) : (
                <Lock className="h-5 w-5" style={{ color }} />
              )}
            </motion.span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-lg p-1.5 text-text-muted opacity-0 transition-[opacity,color,background-color] hover:bg-error/10 hover:text-error focus:opacity-100 group-hover:opacity-100"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Title */}
          <h2 className="line-clamp-1 text-sm font-semibold text-text">
            {capsule.title}
          </h2>

          {/* Content preview or sealed state */}
          <div className="mt-2 flex-1">
            {isOpened ? (
              <p className="line-clamp-3 text-xs leading-relaxed text-text-muted">
                {capsule.content}
              </p>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-gray-800)] bg-[var(--color-gray-950)] py-4">
                <Lock className="h-5 w-5 text-text-muted" />
                <p className="mt-2 text-xs text-text-muted">内容已封存</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--color-gray-900)] pt-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar className="h-3 w-3 text-text-muted" />
              <span className="text-text-muted">
                {isOpened
                  ? formatDate(capsule.openedAt ?? capsule.openAt)
                  : formatDate(capsule.openAt)}
              </span>
            </div>
            {isOpened ? (
              <Badge variant="success">已开启</Badge>
            ) : canOpen ? (
              <Badge className="border-highlight/30 bg-highlight/10 text-highlight">可开启</Badge>
            ) : (
              <Badge variant="default">{remaining} 天后</Badge>
            )}
          </div>

          {/* Action */}
          {(canOpen || isOpened) && (
            <Button
              variant={isOpened ? 'secondary' : 'primary'}
              size="sm"
              loading={opening}
              className="mt-3 w-full"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            >
              {isOpened ? (
                <>
                  <Mail className="h-3.5 w-3.5" />
                  查看内容
                </>
              ) : (
                <>
                  <LockOpen className="h-3.5 w-3.5" />
                  立即开启
                </>
              )}
            </Button>
          )}
        </div>
      </GlassLayer>
    </motion.div>
  );
}

function CapsuleDetail({ capsule }: { capsule: TimeCapsule }) {
  const isOpened = capsule.status === CapsuleStatus.OPENED;
  const remaining = daysUntil(capsule.openAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">{capsuleTypeLabels[capsule.type] ?? capsule.type}</Badge>
        <Badge variant={isOpened ? 'success' : 'accent'}>
          {capsuleStatusLabels[capsule.status] ?? capsule.status}
        </Badge>
      </div>

      {isOpened ? (
        <GlassLayer intensity="subtle" className="p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
            {capsule.content}
          </p>
        </GlassLayer>
      ) : (
        <GlassLayer intensity="subtle" className="flex flex-col items-center justify-center py-10 text-center">
          <Lock className="h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">内容已封存</p>
          {remaining > 0 ? (
            <p className="mt-1 text-xs text-text-muted">
              还有 <span className="font-semibold text-highlight">{remaining}</span> 天可以开启
            </p>
          ) : (
            <p className="mt-1 text-xs text-highlight">已到开启时间，可以开启</p>
          )}
        </GlassLayer>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-gray-900)] pt-4 text-xs">
        <div>
          <span className="text-text-muted">封存时间</span>
          <p className="mt-0.5 text-text">{formatDateTime(capsule.sealedAt)}</p>
        </div>
        <div>
          <span className="text-text-muted">开启时间</span>
          <p className="mt-0.5 text-text">{formatDate(capsule.openAt)}</p>
        </div>
        {capsule.openedAt && (
          <div>
            <span className="text-text-muted">实际开启</span>
            <p className="mt-0.5 text-text">{formatDateTime(capsule.openedAt)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCapsuleModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [openAt, setOpenAt] = React.useState('');
  const [type, setType] = React.useState('personal');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setContent('');
      setOpenAt('');
      setType('personal');
      setError(null);
    }
  }, [open]);

  // Default open date: one year from now
  React.useEffect(() => {
    if (open && !openAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      setOpenAt(d.toISOString().slice(0, 10));
    }
  }, [open, openAt]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入标题');
      return;
    }
    if (!content.trim()) {
      setError('请输入胶囊内容');
      return;
    }
    if (!openAt) {
      setError('请选择开启日期');
      return;
    }
    const openDate = new Date(openAt);
    if (openDate.getTime() <= Date.now()) {
      setError('开启日期必须晚于当前时间');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/capsules', {
        title: title.trim(),
        content: content.trim(),
        type,
        openAt: openDate.toISOString(),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    { value: 'personal', label: '个人' },
    { value: 'family', label: '家庭' },
    { value: 'public', label: '公开' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="创建时间胶囊"
      description="封存一段话，留给未来的自己"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading} className="gap-2">
            {!loading && <Sparkles className="h-4 w-4" />}
            封存
          </Button>
        </>
      }
    >
      <GlassLayer intensity="default" className="-m-6 p-6 space-y-4">
        <Input
          label="标题"
          placeholder="给未来的自己一句话..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={error ?? undefined}
        />

        <Textarea
          label="内容"
          placeholder="写下你想对未来的自己说的话..."
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text">开启日期</label>
          <input
            type="date"
            value={openAt}
            onChange={(e) => setOpenAt(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] px-4 text-sm text-text transition-colors focus:border-accent/40 focus:outline-none [color-scheme:dark] backdrop-blur-xl"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text">类型</label>
          <div className="flex gap-2">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={cn(
                  'flex-1 rounded-xl border px-3 py-2 text-sm transition-[color,background-color,border-color] spring-fast',
                  type === opt.value
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-[var(--color-gray-800)] text-text-muted hover:border-[var(--color-gray-700)] hover:text-text',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </GlassLayer>
    </Modal>
  );
}

function EmptyCapsules({ onCreate }: { onCreate: () => void }) {
  return (
    <GlassLayer intensity="default" className="flex flex-col items-center justify-center py-20 text-center">
      {/* Breathing seedling */}
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20"
      >
        <motion.svg
          width="32"
          height="32"
          viewBox="0 0 64 80"
          fill="none"
          animate={{ rotate: [-3, 3, -3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path
            d="M32 78 C32 60, 30 45, 28 35"
            stroke="var(--color-highlight)"
            strokeOpacity="0.5"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <ellipse
            cx="22"
            cy="32"
            rx="10"
            ry="6"
            fill="var(--color-success)"
            fillOpacity="0.4"
          />
          <ellipse
            cx="42"
            cy="28"
            rx="12"
            ry="7"
            fill="var(--color-success)"
            fillOpacity="0.35"
          />
          <circle
            cx="32"
            cy="22"
            r="4"
            fill="var(--color-secondary)"
            fillOpacity="0.3"
          />
        </motion.svg>
      </motion.div>

      <p className="mt-4 text-base font-medium text-text">还没有时间胶囊</p>
      <p className="mt-1 max-w-sm text-sm text-text-muted">
        封存一段话给未来的自己，在指定的时间开启它。
      </p>
      <Button onClick={onCreate} className="mt-6 gap-2">
        <Plus className="h-4 w-4" />
        创建第一个胶囊
      </Button>
    </GlassLayer>
  );
}
