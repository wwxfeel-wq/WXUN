'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookMarked, Sparkles, TrendingUp, Play, CheckCircle, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getIcon } from '@/components/home/icon-map';
import { useFamilyHubStore, type SkillProgress } from '@/stores/family-hub-store';
import type { SkillAbility } from '@echolife/shared';
import { GlassLayer } from '@/components/glass';

export interface SkillDetailModalProps {
  skill: SkillProgress | null;
  open: boolean;
  onClose: () => void;
}

/* ── Skill status metadata ──
 * mastered = 已掌握 (绿色)
 * learning = 学习中 + 进度条
 * new      = NEW (蓝色闪烁)
 * updated  = Updated (琥珀色)
 */
interface SkillStatusMeta {
  label: string;
  color: string;
  blink: boolean;
}

const SKILL_STATUS_META: Record<SkillProgress['status'], SkillStatusMeta> = {
  mastered: { label: '已掌握', color: 'var(--color-success)', blink: false },
  learning: { label: '学习中', color: 'var(--color-secondary)', blink: false },
  new: { label: 'NEW', color: 'var(--color-secondary)', blink: true },
  updated: { label: 'Updated', color: 'var(--color-highlight)', blink: false },
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 20 };

export function SkillDetailModal({ skill, open, onClose }: SkillDetailModalProps) {
  const triggerSkillLearn = useFamilyHubStore((s) => s.triggerSkillLearn);
  const invokeSkillAbility = useFamilyHubStore((s) => s.invokeSkillAbility);
  const [upgrading, setUpgrading] = React.useState(false);
  const [executingAbility, setExecutingAbility] = React.useState<string | null>(null);
  const [executionResult, setExecutionResult] = React.useState<{
    abilityName: string;
    success: boolean;
    summary: string;
  } | null>(null);

  /* Keep the last non-null skill so the exit animation can render content
   * even after the parent has cleared the `skill` prop on close. */
  const [lockedSkill, setLockedSkill] = React.useState<SkillProgress | null>(null);
  React.useEffect(() => {
    if (skill) {
      setLockedSkill(skill);
      setExecutionResult(null);
    }
  }, [skill]);

  // Prefer the live skill while open; fall back to the locked snapshot on close.
  const current = open && skill ? skill : lockedSkill;

  const handleLevelUp = async () => {
    if (!current) return;
    setUpgrading(true);
    try {
      await triggerSkillLearn(current.id);
    } finally {
      setUpgrading(false);
      onClose();
    }
  };

  const handleExecuteAbility = async (ability: SkillAbility) => {
    if (!current || !ability.toolName) return;
    setExecutingAbility(ability.name);
    setExecutionResult(null);

    try {
      const result = await invokeSkillAbility(current.id, {
        abilityName: ability.name,
        parameters: ability.parameters,
      });
      setExecutionResult({
        abilityName: ability.name,
        success: result.success,
        summary: result.summary,
      });
    } catch (err) {
      setExecutionResult({
        abilityName: ability.name,
        success: false,
        summary: err instanceof Error ? err.message : '执行失败，请稍后重试',
      });
    } finally {
      setExecutingAbility(null);
    }
  };

  if (!current) {
    return <Modal open={open} onClose={onClose} />;
  }

  const meta = SKILL_STATUS_META[current.status] ?? SKILL_STATUS_META.learning;
  const Icon = getIcon(current.icon);
  const nextLevel = current.level + 1;
  const executableAbilities = current.abilities?.filter((a) => a.unlocked && a.toolName) ?? [];

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      {/* ── Hero: icon + level badge + name ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center text-center"
      >
        <div
          className="absolute -top-6 h-24 w-24 rounded-full blur-orb-sm opacity-25 pointer-events-none"
          style={{ backgroundColor: current.color }}
        />

        <motion.span
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl border"
          style={{
            borderColor: `color-mix(in srgb, ${current.color} 18%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${current.color} 7%, transparent)`,
          }}
          whileHover={{ scale: 1.06, rotate: -2 }}
          transition={spring}
        >
          <Icon size={28} style={{ color: current.color }} />
        </motion.span>

        <motion.span
          className="relative mt-3 text-2xs font-medium px-2.5 py-0.5 rounded-full"
          style={{
            color: current.color,
            backgroundColor: `color-mix(in srgb, ${current.color} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${current.color} 15%, transparent)`,
          }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
        >
          Lv.{current.level}
        </motion.span>

        <h3 className="relative mt-2 text-lg font-semibold text-text">{current.name}</h3>
      </motion.div>

      {/* ── Status tag ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-5 flex items-center justify-center"
      >
        <motion.span
          className="inline-flex items-center gap-1.5 text-2xs font-medium px-2.5 py-1 rounded-full"
          style={{
            color: meta.color,
            backgroundColor: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${meta.color} 14%, transparent)`,
          }}
          animate={meta.blink ? { opacity: [1, 0.4, 1] } : undefined}
          transition={
            meta.blink
              ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
        >
          {meta.blink && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
          )}
          {meta.label}
        </motion.span>
      </motion.div>

      {/* ── Source agent ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-4 flex items-center justify-center gap-1.5 text-xs text-text-subtle"
      >
        <BookMarked size={12} className="shrink-0" />
        <span>来源 Agent：</span>
        <span className="text-text-muted font-medium">{current.sourceAgent}</span>
      </motion.div>

      {/* ── Executable abilities ── */}
      {executableAbilities.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3 }}
          className="mt-5"
        >
          <GlassLayer intensity="default" className="p-3">
            <p className="text-2xs font-medium text-text-subtle mb-2 flex items-center gap-1">
              <Play size={11} />
              可执行能力
            </p>
            <div className="space-y-2">
              {executableAbilities.map((ability) => (
                <AbilityExecuteRow
                  key={ability.name}
                  ability={ability}
                  skillColor={current.color}
                  executing={executingAbility === ability.name}
                  onExecute={() => handleExecuteAbility(ability)}
                />
              ))}
            </div>

            <AnimatePresence>
              {executionResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <div
                    className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{
                      color: executionResult.success ? 'var(--color-success)' : 'var(--color-error)',
                      backgroundColor: executionResult.success
                        ? 'color-mix(in srgb, var(--color-success) 7%, transparent)'
                        : 'color-mix(in srgb, var(--color-error) 7%, transparent)',
                      border: `1px solid ${executionResult.success
                        ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
                        : 'color-mix(in srgb, var(--color-error) 14%, transparent)'}`,
                    }}
                  >
                    {executionResult.success ? (
                      <CheckCircle size={14} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">
                        {executionResult.success ? '执行成功' : '执行失败'}
                      </p>
                      <p className="opacity-90 mt-0.5">{executionResult.summary}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassLayer>
        </motion.div>
      )}

      {/* ── Learning progress + 继续学习 hint ── */}
      {current.status === 'learning' && typeof current.progress === 'number' && (
        <GlassLayer intensity="default" className="mt-4 p-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs text-text-subtle flex items-center gap-1">
              <TrendingUp size={11} />
              学习进度
            </span>
            <span className="text-2xs font-medium text-text-muted">
              {current.progress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--color-gray-900)] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: current.color }}
              initial={{ width: 0 }}
              animate={{ width: `${current.progress}%` }}
              transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-2 text-3xs text-text-subtle text-center">
            继续学习，掌握后将提升至 Lv.{nextLevel}
          </p>
          </motion.div>
        </GlassLayer>
      )}

      {/* ── Level up action ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="mt-6"
      >
        <Button
          onClick={handleLevelUp}
          loading={upgrading}
          className="w-full"
          size="md"
        >
          <Sparkles size={15} />
          提升等级
        </Button>
      </motion.div>
    </Modal>
  );
}

function AbilityExecuteRow({
  ability,
  skillColor,
  executing,
  onExecute,
}: {
  ability: SkillAbility;
  skillColor: string;
  executing: boolean;
  onExecute: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
      style={{
        backgroundColor: `color-mix(in srgb, ${skillColor} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${skillColor} 10%, transparent)`,
      }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-text truncate">{ability.name}</p>
        {ability.description && (
          <p className="text-3xs text-text-subtle truncate">{ability.description}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onExecute}
        loading={executing}
        disabled={executing}
        className="shrink-0 h-7 text-2xs px-2.5"
      >
        <Play size={12} />
        执行
      </Button>
    </div>
  );
}

export default SkillDetailModal;
