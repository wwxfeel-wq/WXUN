'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TreePine,
  ChevronRight,
  User,
  Calendar,
  MapPin,
  Sparkles,
  Plus,
  Folder,
  Link2,
  BookOpen,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition } from '@/components/page-transition';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FullScreenLoader } from '@/components/ui/loading';
import { GlassLayer } from '@/components/glass';
import { apiClient, swrFetcher, ApiError } from '@/lib/api-client';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { lifeTreeNodeTypeLabels } from '@/lib/labels';
import {
  LifeTreeNodeType,
  type LifeTreeNode,
  type Memory,
  type PaginatedResponse,
} from '@echolife/shared';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE },
};

const springHover = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 28,
};

/** Icon + color for each node type. */
const nodeTypeMeta: Record<
  string,
  { icon: LucideIcon; color: string; labelColor: string }
> = {
  [LifeTreeNodeType.ROOT]: {
    icon: TreePine,
    color: 'var(--color-apple-blue)',
    labelColor: 'bg-[var(--color-apple-blue)]/10 text-[var(--color-apple-blue)]',
  },
  [LifeTreeNodeType.CATEGORY]: {
    icon: Folder,
    color: 'var(--color-apple-gray)',
    labelColor: 'bg-[var(--color-apple-gray)]/10 text-[var(--color-apple-gray)]',
  },
  [LifeTreeNodeType.EVENT]: {
    icon: Calendar,
    color: 'var(--color-apple-amber)',
    labelColor: 'bg-[var(--color-apple-amber)]/10 text-[var(--color-apple-amber)]',
  },
  [LifeTreeNodeType.PERSON]: {
    icon: User,
    color: 'var(--color-apple-green)',
    labelColor: 'bg-[var(--color-apple-green)]/10 text-[var(--color-apple-green)]',
  },
  [LifeTreeNodeType.PLACE]: {
    icon: MapPin,
    color: 'var(--color-indigo)',
    labelColor: 'bg-[var(--color-indigo)]/10 text-[var(--color-indigo)]',
  },
  [LifeTreeNodeType.THEME]: {
    icon: Sparkles,
    color: 'var(--color-apple-purple)',
    labelColor: 'bg-[var(--color-apple-purple)]/10 text-[var(--color-apple-purple)]',
  },
};

const typeOptions = [
  { value: LifeTreeNodeType.CATEGORY, label: '分类', icon: Folder, color: 'var(--color-apple-gray)' },
  { value: LifeTreeNodeType.EVENT, label: '事件', icon: Calendar, color: 'var(--color-apple-amber)' },
  { value: LifeTreeNodeType.PERSON, label: '人物', icon: User, color: 'var(--color-apple-green)' },
  { value: LifeTreeNodeType.PLACE, label: '地点', icon: MapPin, color: 'var(--color-indigo)' },
  { value: LifeTreeNodeType.THEME, label: '主题', icon: Sparkles, color: 'var(--color-apple-purple)' },
];

export default function LifeTreePage() {
  const { data, isLoading, mutate } = useSWR<LifeTreeNode[]>(
    '/life-tree',
    swrFetcher,
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createParentId, setCreateParentId] = React.useState<string | null>(null);

  const nodes = data ?? [];

  // Recursively find a node by id within the nested tree.
  const findNode = React.useCallback(
    (list: LifeTreeNode[], id: string): LifeTreeNode | null => {
      for (const n of list) {
        if (n.id === id) return n;
        if (n.children?.length) {
          const found = findNode(n.children, id);
          if (found) return found;
        }
      }
      return null;
    },
    [],
  );

  const selectedNode = selectedId ? findNode(nodes, selectedId) : null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenCreate = (parentId: string | null) => {
    setCreateParentId(parentId);
    setCreateOpen(true);
  };

  if (isLoading && !data) {
    return <FullScreenLoader label="加载生命树中..." />;
  }

  return (
    <PageTransition>
      {/* ===== Header ===== */}
      <motion.div
        {...fadeUp}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <GlassLayer
            asChild
            intensity="strong"
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
          >
            <motion.span
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: EASE }}
            >
              <TreePine className="h-5 w-5 text-accent" />
            </motion.span>
          </GlassLayer>
          <div>
            <h1 className="text-xl font-semibold text-text tracking-tight">生命树</h1>
            <p className="text-sm text-text-muted">将你的记忆编织成一棵生命之树</p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button onClick={() => handleOpenCreate(null)} className="gap-2">
            <Plus className="h-4 w-4" />
            添加节点
          </Button>
        </motion.div>
      </motion.div>

      {/* ===== Main Content ===== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Tree panel */}
        <GlassLayer
          asChild
          intensity="strong"
          className="lg:col-span-4 xl:col-span-3 flex flex-col overflow-hidden"
        >
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Folder className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-xs font-medium text-text-muted">节点目录</span>
              </div>
              <span className="text-3xs text-text-subtle">{nodes.length} 个根节点</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 lg:max-h-vh-minus-13rem">
              {nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <GlassLayer
                    asChild
                    intensity="default"
                    className="flex h-14 w-14 items-center justify-center rounded-2xl animate-breathe"
                  >
                    <span>
                      <TreePine className="h-7 w-7 text-text-muted" />
                    </span>
                  </GlassLayer>
                  <p className="mt-3 text-sm font-medium text-text">生命树还是空的</p>
                  <p className="mt-1 text-xs text-text-muted">添加第一个节点开始构建你的生命树</p>
                  <Button size="sm" className="mt-4 gap-1.5" onClick={() => handleOpenCreate(null)}>
                    <Plus className="h-4 w-4" />
                    添加节点
                  </Button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {nodes.map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      selectedId={selectedId}
                      onToggle={toggleExpand}
                      onSelect={setSelectedId}
                      onAddChild={handleOpenCreate}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </GlassLayer>

        {/* Detail panel */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.15 }}
          className="lg:col-span-8 xl:col-span-9"
        >
          <AnimatePresence mode="wait">
            {selectedNode ? (
              <NodeDetail
                key={selectedNode.id}
                node={selectedNode}
                onAddChild={() => handleOpenCreate(selectedNode.id)}
                onDeleted={() => {
                  setSelectedId(null);
                  void mutate();
                }}
              />
            ) : (
              <GlassLayer
                asChild
                intensity="strong"
                className="flex h-full min-h-104 flex-col items-center justify-center py-16 text-center"
              >
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <GlassLayer
                    asChild
                    intensity="default"
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                  >
                    <span>
                      <Link2 className="h-8 w-8 text-text-muted" />
                    </span>
                  </GlassLayer>
                  <p className="mt-4 text-base font-medium text-text">选择一个节点</p>
                  <p className="mt-1 text-sm text-text-muted max-w-xs">
                    在左侧树中选择节点查看详情与关联记忆
                  </p>
                </motion.div>
              </GlassLayer>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <CreateNodeModal
        open={createOpen}
        parentId={createParentId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void mutate();
        }}
      />
    </PageTransition>
  );
}

/** Recursive tree node renderer. */
function TreeNode({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onAddChild,
}: {
  node: LifeTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const meta = nodeTypeMeta[node.type] ?? nodeTypeMeta[LifeTreeNodeType.CATEGORY];
  const Icon = meta.icon;

  return (
    <div>
      <motion.div
        className={cn(
          'group flex items-center gap-1.5 rounded-xl border py-2 pr-2 transition-[background-color,border-color,color] duration-300',
          isSelected
            ? 'bg-surface border-[var(--color-border-focus)]/30'
            : 'border-transparent hover:bg-[var(--color-gray-950)]',
        )}
        style={{
          paddingLeft: 'calc(var(--tree-indent) * var(--depth) + var(--tree-offset))',
          '--depth': depth,
        } as React.CSSProperties}
        whileHover={{ scale: 1.005 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-ring"
            aria-label={isExpanded ? '收起' : '展开'}
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform duration-200', isExpanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <button
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-ring rounded-lg py-1 pr-1"
        >
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
              isSelected ? 'bg-surface border-border' : 'bg-surface/50 border-border',
            )}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          </span>
          <span
            className={cn(
              'truncate text-sm transition-colors',
              isSelected ? 'font-medium text-accent' : 'text-text',
            )}
          >
            {node.title}
          </span>
          {hasChildren && (
            <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-3xs text-text-muted">
              {children.length}
            </span>
          )}
        </button>

        <button
          onClick={() => onAddChild(node.id)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-[opacity,color,background-color] hover:bg-surface hover:text-accent group-hover:opacity-100 focus-ring"
          aria-label="添加子节点"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            {children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={onToggle}
                onSelect={onSelect}
                onAddChild={onAddChild}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Right-side detail panel for a selected node. */
function NodeDetail({
  node,
  onAddChild,
  onDeleted,
}: {
  node: LifeTreeNode;
  onAddChild: () => void;
  onDeleted: () => void;
}) {
  const meta = nodeTypeMeta[node.type] ?? nodeTypeMeta[LifeTreeNodeType.CATEGORY];
  const Icon = meta.icon;

  const { data: memoriesData, isLoading } = useSWR<PaginatedResponse<Memory>>(
    `/memories?lifeTreeNodeId=${node.id}&pageSize=10`,
    swrFetcher,
  );
  const linkedMemories = memoriesData?.items ?? [];

  const handleDelete = async () => {
    if (!confirm('确定删除该节点吗？子节点也会被一并删除。')) return;
    try {
      await apiClient.delete(`/life-tree/${node.id}`);
      onDeleted();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  return (
    <GlassLayer
      asChild
      intensity="strong"
      className="relative overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        {/* Glow accent based on node type */}
        <div
          className="absolute -top-24 -right-24 h-48 w-48 rounded-full blur-orb-md opacity-[0.12] pointer-events-none"
          style={{ backgroundColor: meta.color }}
        />

        <div className="relative z-10 p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface">
              <Icon className="h-6 w-6" style={{ color: meta.color }} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text tracking-tight">{node.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge className={cn('text-3xs font-medium border-0', meta.labelColor)}>
                  {lifeTreeNodeTypeLabels[node.type] ?? node.type}
                </Badge>
                <span className="text-xs text-text-muted">创建于 {formatRelativeTime(node.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onAddChild} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              子节点
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="删除节点" className="h-9 w-9">
              <Trash2 className="h-4 w-4 text-error" />
            </Button>
          </div>
        </div>

        {/* Description */}
        {node.description && (
          <div className="mt-5 rounded-xl border border-border bg-surface/50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-muted">
              {node.description}
            </p>
          </div>
        )}

        {/* Metadata */}
        {(node.metadata as Record<string, unknown> | null) &&
          Object.keys(node.metadata as Record<string, unknown>).length > 0 && (
            <GlassLayer className="mt-5 p-4">
              <p className="mb-3 text-xs font-medium text-text-muted">元数据</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(node.metadata as Record<string, unknown>).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded-lg bg-surface/50 px-3 py-2 text-xs"
                  >
                    <span className="text-text-muted">{k}</span>
                    <span className="truncate max-w-60p text-text">{String(v)}</span>
                  </div>
                ))}
              </div>
            </GlassLayer>
          )}

        {/* Linked memories */}
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-semibold text-text">关联记忆</h3>
            <Badge variant="outline" className="text-3xs">{linkedMemories.length}</Badge>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : linkedMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/30 py-10 text-center">
              <BookOpen className="h-6 w-6 text-text-subtle" />
              <p className="mt-2 text-xs text-text-muted">暂无关联记忆</p>
              <p className="text-3xs text-text-subtle">这个节点还没有记忆关联</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedMemories.map((memory) => (
                <GlassLayer
                  asChild
                  intensity="default"
                  className="group cursor-pointer p-4 focus-ring"
                  key={memory.id}
                >
                  <motion.div
                    whileHover={{ y: -3, scale: 1.005 }}
                    transition={springHover}
                    tabIndex={0}
                    role="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{memory.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{memory.content}</p>
                      </div>
                      <span className="shrink-0 text-3xs text-text-subtle">
                        {formatDate(memory.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                </GlassLayer>
              ))}
            </div>
          )}
        </div>
      </div>
      </motion.div>
    </GlassLayer>
  );
}

/** Modal for creating a new tree node. */
function CreateNodeModal({
  open,
  parentId,
  onClose,
  onCreated,
}: {
  open: boolean;
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<LifeTreeNodeType>(LifeTreeNodeType.CATEGORY);
  const [description, setDescription] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName('');
      setType(LifeTreeNodeType.CATEGORY);
      setDescription('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('请输入节点名称');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/life-tree', {
        title: name.trim(),
        type,
        description: description.trim() || undefined,
        parentId: parentId ?? undefined,
      });
      onCreated();
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
      title="添加节点"
      description={parentId ? '为当前节点添加子节点' : '添加新的根节点'}
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
      <div className="space-y-5">
        <Input
          label="节点名称"
          placeholder="例如：童年、母亲、故乡..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
          className="border-0 focus:border-0"
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text">节点类型</label>
          <div className="grid grid-cols-5 gap-2">
            {typeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = type === opt.value;
              return (
                <GlassLayer
                  asChild
                  intensity="default"
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2.5 transition-colors focus-ring',
                    active && 'bg-glass-strong',
                  )}
                  style={active ? { borderColor: `color-mix(in srgb, ${opt.color}, transparent 70%)` } : undefined}
                  key={opt.value}
                >
                  <motion.button
                    onClick={() => setType(opt.value as LifeTreeNodeType)}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface">
                      <Icon className="h-4 w-4" style={{ color: opt.color }} />
                    </span>
                    <span className={cn('text-3xs sm:text-xs', active ? 'font-medium text-text' : 'text-text-muted')}>
                      {opt.label}
                    </span>
                  </motion.button>
                </GlassLayer>
              );
            })}
          </div>
        </div>

        <Textarea
          label="描述（可选）"
          placeholder="描述这个节点..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-0 focus:border-0 min-h-24"
        />
      </div>
    </Modal>
  );
}
