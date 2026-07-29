'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  BookOpen,
  Calendar,
  Heart,
  X,
  Landmark as LandmarkIcon,
  type LucideIcon,
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { CardSkeletonGrid, FullScreenLoader } from '@/components/ui/loading';
import { swrFetcher } from '@/lib/api-client';
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getEmotionColor,
  getEmotionLabel,
} from '@/lib/utils';
import { memoryTypeLabels, memoryVisibilityLabels } from '@/lib/labels';
import { type Memory, type PaginatedResponse } from '@echolife/shared';

/** Filter options. */
const typeFilters = [
  { value: '', label: '全部类型' },
  ...Object.entries(memoryTypeLabels).map(([value, label]) => ({ value, label })),
];

const emotionFilters = [
  { value: '', label: '全部情感' },
  { value: 'joy', label: '喜悦' },
  { value: 'sadness', label: '悲伤' },
  { value: 'love', label: '爱' },
  { value: 'nostalgia', label: '怀旧' },
  { value: 'pride', label: '骄傲' },
  { value: 'gratitude', label: '感恩' },
];

const dateRangeFilters = [
  { value: '', label: '全部时间' },
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: '365', label: '近一年' },
];

export default function MuseumPage() {
  // useSearchParams must be wrapped in a Suspense boundary during prerender.
  return (
    <React.Suspense fallback={<FullScreenLoader label="加载记忆中..." />}>
      <MuseumContent />
    </React.Suspense>
  );
}

function MuseumContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [search, setSearch] = React.useState(initialQuery);
  const [typeFilter, setTypeFilter] = React.useState('');
  const [emotionFilter, setEmotionFilter] = React.useState('');
  const [dateRange, setDateRange] = React.useState('');
  const [selected, setSelected] = React.useState<Memory | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialQuery);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Build query params
  const params = React.useMemo(() => {
    const p: Record<string, string | number | undefined> = {
      pageSize: 50,
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (typeFilter) p.type = typeFilter;
    if (emotionFilter) p.emotion = emotionFilter;
    if (dateRange) {
      const days = parseInt(dateRange, 10);
      const start = new Date();
      start.setDate(start.getDate() - days);
      p.startDate = start.toISOString();
    }
    return p;
  }, [debouncedSearch, typeFilter, emotionFilter, dateRange]);

  const queryString = React.useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    }
    return sp.toString();
  }, [params]);

  const { data, isLoading, isValidating } = useSWR<PaginatedResponse<Memory>>(
    `/memories?${queryString}`,
    swrFetcher,
    { keepPreviousData: true },
  );

  const memories = data?.items ?? [];
  const hasActiveFilters = Boolean(typeFilter || emotionFilter || dateRange || debouncedSearch);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setEmotionFilter('');
    setDateRange('');
  };

  if (isLoading && !data) {
    return <FullScreenLoader label="加载记忆中..." />;
  }

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text">记忆博物馆</h1>
        <p className="text-sm text-text-muted">
          浏览你珍藏的每一段记忆，共 {data?.total ?? 0} 段
        </p>
      </div>

      {/* Search + filter toggle */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <GlassLayer
            intensity="subtle"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg [&:focus-within]:bg-[var(--color-glass-hover)] [&:focus-within]:border-[var(--color-border-focus)] [&:focus-within]:shadow-[var(--shadow-inner),var(--shadow-focus)]"
          >
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="搜索记忆标题或内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="搜索记忆标题或内容"
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted/60 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清空搜索"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-text-muted/20 text-text-muted transition-colors hover:bg-text-muted/30 hover:text-text"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </GlassLayer>
        </div>
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          onClick={() => setShowFilters((v) => !v)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          筛选
          {hasActiveFilters && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary/20 px-1 text-3xs">
              !
            </span>
          )}
        </Button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 overflow-hidden"
        >
          <GlassLayer intensity="subtle" className="space-y-4 p-4">
            <FilterRow
              label="类型"
              options={typeFilters}
              value={typeFilter}
              onChange={setTypeFilter}
            />
            <FilterRow
              label="情感"
              options={emotionFilters}
              value={emotionFilter}
              onChange={setEmotionFilter}
            />
            <FilterRow
              label="时间"
              options={dateRangeFilters}
              value={dateRange}
              onChange={setDateRange}
            />
            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  清除筛选
                </Button>
              </div>
            )}
          </GlassLayer>
        </motion.div>
      )}

      {/* Grid */}
      {isLoading || isValidating ? (
        <CardSkeletonGrid count={6} />
      ) : memories.length === 0 ? (
        <EmptyMuseum hasFilters={hasActiveFilters} onClear={clearFilters} />
      ) : (
        <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {memories.map((memory) => (
            <StaggerItem key={memory.id}>
              <MemoryCard memory={memory} onClick={() => setSelected(memory)} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title}
        description={selected ? formatRelativeTime(selected.createdAt) : undefined}
        className="max-w-2xl"
      >
        {selected && <MemoryDetail memory={selected} />}
      </Modal>
    </PageTransition>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-sm text-text-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <GlassLayer
            key={opt.value}
            asChild
            intensity={value === opt.value ? 'default' : 'subtle'}
            className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors"
          >
            <motion.button
              onClick={() => onChange(opt.value)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                value === opt.value ? 'text-accent' : 'text-text-muted hover:text-text',
              )}
            >
              {opt.label}
            </motion.button>
          </GlassLayer>
        ))}
      </div>
    </div>
  );
}

const typeIcons: Record<string, LucideIcon> = {
  story: BookOpen,
  event: Calendar,
  relationship: Heart,
  emotion: Heart,
  achievement: BookOpen,
  reflection: BookOpen,
  daily: Calendar,
};

function MemoryCard({ memory, onClick }: { memory: Memory; onClick: () => void }) {
  const color = getEmotionColor(memory.emotion);
  const TypeIcon = typeIcons[memory.type] ?? BookOpen;

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div
        className="glass-card glass-card-hover flex h-full flex-col p-5 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {/* Top row: type icon + emotion */}
        <div className="mb-3 flex items-center justify-between">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1a` }}
          >
            <TypeIcon className="h-4 w-4" style={{ color }} />
          </span>
          {memory.emotion && (
            <Badge color={color}>{getEmotionLabel(memory.emotion)}</Badge>
          )}
        </div>

        {/* Title */}
        <h2 className="line-clamp-1 text-sm font-semibold text-text">
          {memory.title}
        </h2>

        {/* Content preview */}
        <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-relaxed text-text-muted">
          {memory.content}
        </p>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
          <Badge variant="outline" className="text-3xs">
            {memoryTypeLabels[memory.type] ?? memory.type}
          </Badge>
          <span className="text-2xs text-text-muted">
            {formatDate(memory.occurredAt ?? memory.createdAt)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function MemoryDetail({ memory }: { memory: Memory }) {
  const color = getEmotionColor(memory.emotion);
  return (
    <div className="space-y-4">
      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">{memoryTypeLabels[memory.type] ?? memory.type}</Badge>
        <Badge variant="outline">
          {memoryVisibilityLabels[memory.visibility] ?? memory.visibility}
        </Badge>
        {memory.emotion && (
          <Badge color={color}>
            {getEmotionLabel(memory.emotion)}
            {typeof memory.emotionScore === 'number' && ` · ${Math.round(memory.emotionScore)}`}
          </Badge>
        )}
        {typeof memory.importance === 'number' && (
          <Badge variant="warning">重要性 {Math.round(memory.importance)}</Badge>
        )}
      </div>

      {/* Content */}
      <div className="prose prose-invert max-w-none">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
          {memory.content}
        </p>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
        <div>
          <span className="text-text-muted">发生时间</span>
          <p className="mt-0.5 text-text">
            {memory.occurredAt ? formatDate(memory.occurredAt, 'yyyy-MM-dd') : '未记录'}
          </p>
        </div>
        <div>
          <span className="text-text-muted">记录时间</span>
          <p className="mt-0.5 text-text">{formatDateTime(memory.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyMuseum({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <GlassLayer intensity="subtle" className="flex flex-col items-center justify-center py-16 text-center">
      <motion.span
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-hover"
        animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <LandmarkIcon className="h-7 w-7 text-text-muted" />
      </motion.span>
      <p className="mt-4 text-base font-medium text-text">
        {hasFilters ? '没有找到匹配的记忆' : '记忆博物馆还是空的'}
      </p>
      <p className="mt-1 text-sm text-text-muted">
        {hasFilters
          ? '试试调整筛选条件，或清除筛选查看全部。'
          : '开始第一次 AI 访谈，记录你的第一段回忆吧。'}
      </p>
      {hasFilters && (
        <Button variant="secondary" size="sm" onClick={onClear} className="mt-4">
          清除筛选
        </Button>
      )}
    </GlassLayer>
  );
}
