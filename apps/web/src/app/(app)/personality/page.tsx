"use client";

import * as React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { Dna, Sparkles, TrendingUp, Clock } from "lucide-react";
import useSWR from "swr";
import {
  PageTransition,
  StaggerContainer,
  StaggerItem,
} from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FullScreenLoader, Spinner } from "@/components/ui/loading";
import { GlassLayer } from "@/components/glass";
import { apiClient, swrFetcher, ApiError } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";
import { personalityDimensions } from "@/lib/labels";
import type { PersonalityProfile } from "@echolife/shared";

/** Mix a CSS variable color with opacity using the design system. */
function colorMix(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

const dimensionColors: Record<string, string> = {
  openness: "var(--color-apple-blue)",
  conscientiousness: "var(--color-apple-green)",
  extraversion: "var(--color-apple-amber)",
  agreeableness: "var(--color-indigo)",
  neuroticism: "var(--color-apple-red)",
};

export default function PersonalityPage() {
  const {
    data: profile,
    isLoading,
    mutate,
  } = useSWR<PersonalityProfile>("/personality", swrFetcher);
  const { data: history } = useSWR<PersonalityProfile[]>(
    "/personality/history",
    swrFetcher,
  );

  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const newProfile = await apiClient.post<PersonalityProfile>(
        "/personality/generate",
      );
      await mutate(newProfile, false);
      void mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "生成失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading && !profile) {
    return <FullScreenLoader label="加载人格画像中..." />;
  }

  // Build radar chart data
  const radarData = personalityDimensions.map((dim) => ({
    dimension: dim.label,
    value: Math.round(
      ((profile?.[dim.key as keyof PersonalityProfile] as number) ?? 0.5) * 100,
    ),
    fullMark: 100,
  }));

  const historyList = history ?? [];

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">人格 DNA</h1>
          <p className="text-sm text-text-muted">
            基于你的记忆与访谈生成的性格画像
          </p>
        </div>
        <Button onClick={handleGenerate} loading={generating} className="gap-2">
          {!generating && <Sparkles className="h-4 w-4" />}
          {generating ? "生成中..." : "生成画像"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {generating && !profile && (
        <GlassLayer asChild intensity="strong">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Spinner size={32} />
            <p className="mt-4 text-sm text-text-muted">
              正在分析你的记忆，生成人格画像...
            </p>
            <p className="mt-1 text-xs text-text-muted/70">
              这可能需要一点时间
            </p>
          </div>
        </GlassLayer>
      )}

      {!profile && !generating ? (
        <EmptyPersonality onGenerate={handleGenerate} loading={generating} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Radar chart */}
          <GlassLayer asChild intensity="strong">
            <div className="lg:col-span-2 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Dna className="h-5 w-5 text-accent" />
                <h2 className="text-base font-semibold text-text">
                  性格雷达图
                </h2>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={radarData}
                    cx="50%"
                    cy="50%"
                    outerRadius="72%"
                  >
                    <PolarGrid stroke="var(--color-gray-800)" />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fill: "var(--color-apple-gray)", fontSize: 'var(--text-xs)' }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--color-apple-gray)", fontSize: 'var(--text-xs)' }}
                      axisLine={false}
                      tickCount={5}
                    />
                    <Radar
                      name="得分"
                      dataKey="value"
                      stroke="var(--color-apple-blue)"
                      strokeWidth={2}
                      fill="var(--color-apple-blue)"
                      fillOpacity={0.25}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-xl border border-border bg-background-elevated/85 px-3 py-2 text-xs shadow-lg backdrop-blur-subtle">
                            <p className="text-text-primary">{label}</p>
                            {payload.map((entry, idx) => (
                              <p key={idx} className="text-text-muted">
                                {entry.name}: {entry.value}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {profile && (
                <p className="mt-2 text-center text-xs text-text-muted">
                  最后更新：{formatDate(profile.createdAt, "yyyy-MM-dd HH:mm")}
                </p>
              )}
            </div>
          </GlassLayer>

          {/* Dimension cards + analysis */}
          <div className="space-y-6 lg:col-span-3">
            <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {personalityDimensions.map((dim) => {
                const raw =
                  (profile?.[dim.key as keyof PersonalityProfile] as number) ??
                  0.5;
                const score = Math.round(raw * 100);
                const color = dimensionColors[dim.key];
                return (
                  <StaggerItem key={dim.key}>
                    <DimensionCard
                      label={dim.label}
                      description={dim.description}
                      score={score}
                      color={color}
                    />
                  </StaggerItem>
                );
              })}
            </StaggerContainer>

            {/* Analysis text */}
            {profile?.analysis && (
              <GlassLayer asChild intensity="default">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                    delay: 0.3,
                  }}
                  className="p-6"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold text-text">
                      AI 性格分析
                    </h2>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-muted">
                    {profile.analysis}
                  </p>
                </motion.div>
              </GlassLayer>
            )}
          </div>
        </div>
      )}

      {/* History timeline */}
      {historyList.length > 0 && (
        <GlassLayer asChild intensity="default">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 p-6"
          >
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-muted" />
              <h2 className="text-base font-semibold text-text">
                人格演变时间线
              </h2>
              <Badge variant="outline">{historyList.length}</Badge>
            </div>
            <div className="relative space-y-4 pl-6">
              {/* vertical line */}
              <span className="absolute left-2 top-1 h-full-minus-0.5rem w-px bg-glass-border" />
              {historyList
                .slice()
                .reverse()
                .map((snapshot, idx) => {
                  const isLatest = idx === historyList.length - 1;
                  return (
                    <motion.div
                      key={snapshot.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: idx * 0.05,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="relative"
                    >
                      <span
                        className={cn(
                          "absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                          isLatest ? "bg-accent" : "bg-text-muted",
                        )}
                      />
                      <GlassLayer asChild intensity="default">
                        <motion.div
                          whileHover={{ y: -2 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="p-4 cursor-default"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-text">
                              {formatDate(snapshot.createdAt, "yyyy-MM-dd")}
                            </span>
                            {isLatest && <Badge variant="accent">当前</Badge>}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {personalityDimensions.map((dim) => {
                              const val = Math.round(
                                (snapshot[
                                  dim.key as keyof PersonalityProfile
                                ] as number) * 100,
                              );
                              return (
                                <div
                                  key={dim.key}
                                  className="flex items-center gap-1.5 text-xs"
                                >
                                  <span className="text-text-muted">
                                    {dim.label}
                                  </span>
                                  <span
                                    className="font-semibold"
                                    style={{ color: dimensionColors[dim.key] }}
                                  >
                                    {val}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      </GlassLayer>
                    </motion.div>
                  );
                })}
            </div>
          </motion.div>
        </GlassLayer>
      )}
    </PageTransition>
  );
}

function DimensionCard({
  label,
  description,
  score,
  color,
}: {
  label: string;
  description: string;
  score: number;
  color: string;
}) {
  return (
    <GlassLayer asChild intensity="default">
      <motion.div
        whileHover={{
          y: -4,
          boxShadow: `var(--shadow-md), inset 0 1px 0 var(--color-gray-900), 0 0 24px ${colorMix(color, 0.15)}`,
        }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="p-5 cursor-default"
        style={{ borderColor: colorMix(color, 0.08) }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">{label}</span>
          <span className="text-2xl font-bold" style={{ color }}>
            {score}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-gray-900)]">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          {description}
        </p>
        <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
          <TrendingUp className="h-3 w-3" />
          {score >= 70 ? "突出" : score >= 50 ? "均衡" : "待发展"}
        </div>
      </motion.div>
    </GlassLayer>
  );
}

function EmptyPersonality({
  onGenerate,
  loading,
}: {
  onGenerate: () => void;
  loading: boolean;
}) {
  return (
    <GlassLayer asChild intensity="strong">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <motion.span
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-[var(--color-indigo)]/20"
        >
          <Dna className="h-8 w-8 text-accent" />
        </motion.span>
        <p className="mt-4 text-base font-medium text-text">还没有人格画像</p>
        <p className="mt-1 max-w-sm text-sm text-text-muted">
          点击下方按钮，AI 将根据你的记忆与访谈内容，生成专属的性格画像。
        </p>
        <Button onClick={onGenerate} loading={loading} className="mt-6 gap-2">
          {!loading && <Sparkles className="h-4 w-4" />}
          {loading ? "生成中..." : "生成人格画像"}
        </Button>
      </div>
    </GlassLayer>
  );
}
