"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FlaskConical,
  TrendingUp,
  Clock,
  Check,
  Plus,
  Sprout,
  Lightbulb,
} from "lucide-react";
import {
  PageTransition,
  StaggerContainer,
  StaggerItem,
} from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { GlassLayer } from "@/components/glass";

interface IncubatingSkill {
  id: string;
  name: string;
  progress: number;
  eta: string;
  agent: string;
  description: string;
}

interface GrowthLog {
  id: string;
  date: string;
  title: string;
  detail: string;
  type: "skill" | "agent" | "memory" | "tree";
}

const incubatingSkills: IncubatingSkill[] = [
  {
    id: "1",
    name: "老人慢病管理",
    progress: 82,
    eta: "3天后",
    agent: "Care Agent",
    description: "学习高血压、糖尿病等常见慢病的日常管理知识",
  },
  {
    id: "2",
    name: "家庭园艺",
    progress: 45,
    eta: "继续学习说明书",
    agent: "Life Agent",
    description: "学习多肉植物、室内绿植的养护技巧",
  },
  {
    id: "3",
    name: "家庭理财规划",
    progress: 23,
    eta: "2周后",
    agent: "Finance Agent",
    description: "学习家庭预算编制和储蓄计划制定",
  },
];

const growthLogs: GrowthLog[] = [
  {
    id: "1",
    date: "2025.06.28",
    title: "时墨学会了家庭收纳",
    detail: "掌握日本收纳法，优化家庭储物空间",
    type: "skill",
  },
  {
    id: "2",
    date: "2025.06.25",
    title: "新增 Care Agent",
    detail: "学习老年心理学和防诈骗知识库",
    type: "agent",
  },
  {
    id: "3",
    date: "2025.06.20",
    title: "生命树长出新枝",
    detail: "家庭关系分支进一步繁茂",
    type: "tree",
  },
  {
    id: "4",
    date: "2025.06.15",
    title: "掌握健康监测",
    detail: "建立家庭成员健康档案和预警机制",
    type: "skill",
  },
  {
    id: "5",
    date: "2025.06.10",
    title: "新增 5 段珍贵回忆",
    detail: "访谈记录自动归档到长期记忆",
    type: "memory",
  },
  {
    id: "6",
    date: "2025.06.05",
    title: "学会家电维修",
    detail: "掌握常见家电故障诊断和基础维修",
    type: "skill",
  },
  {
    id: "7",
    date: "2025.05.28",
    title: "学会老人陪伴",
    detail: "学习老年心理学和防诈骗知识库",
    type: "skill",
  },
];

const typeColors: Record<string, { bg: string; text: string }> = {
  skill: { bg: "var(--color-secondary)", text: "var(--color-secondary)" },
  agent: { bg: "var(--color-purple)", text: "var(--color-purple)" },
  memory: { bg: "var(--color-highlight)", text: "var(--color-highlight)" },
  tree: { bg: "var(--color-success)", text: "var(--color-success)" },
};

/** Mix a CSS variable color with opacity using the design system. */
function colorMix(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

const typeLabels: Record<string, string> = {
  skill: "技能",
  agent: "Agent",
  memory: "记忆",
  tree: "生命树",
};

export default function EvolutionPage() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [newSkillName, setNewSkillName] = React.useState("");
  const [newSkillDesc, setNewSkillDesc] = React.useState("");

  const handleSubmit = () => {
    if (!newSkillName.trim()) return;
    // In real app, would submit to API
    setNewSkillName("");
    setNewSkillDesc("");
    setModalOpen(false);
  };

  return (
    <PageTransition>
      <div className="w-full min-h-screen px-6 sm:px-12 lg:px-20 py-8 pb-32">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-2">
              <GlassLayer asChild intensity="strong">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl animate-float">
                  <FlaskConical className="h-5 w-5 text-accent" />
                </span>
              </GlassLayer>
              <div>
                <h1 className="text-2xl font-display font-medium text-text">
                  进化工坊
                </h1>
                <p className="text-sm text-text-muted">
                  时墨的自主进化与技能孵化中心
                </p>
              </div>
            </div>
          </motion.div>

          {/* Skill Incubator */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sprout size={16} className="text-success" />
                <h2 className="text-sm font-semibold text-text">技能孵化器</h2>
              </div>
              <Button
                onClick={() => setModalOpen(true)}
                className="gap-2"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                提交需求
              </Button>
            </div>

            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {incubatingSkills.map((skill) => (
                <StaggerItem key={skill.id}>
                  <GlassLayer asChild intensity="strong">
                    <motion.div
                      whileHover={{ y: -3, scale: 1.01 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                      className="p-5 relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-medium text-text">
                            {skill.name}
                          </h3>
                          <p className="text-2xs text-text-subtle mt-0.5">
                            {skill.description}
                          </p>
                        </div>
                        <div className="px-2 py-0.5 rounded-full bg-accent/10 text-3xs text-accent">
                          {skill.progress}%
                        </div>
                      </div>

                      <div className="w-full bg-[var(--color-gray-900)] rounded-full h-2 mb-3 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-accent via-primary to-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.progress}%` }}
                          transition={{
                            duration: 1.2,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-3xs text-text-subtle">
                        <span>来源: {skill.agent}</span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {skill.eta}
                        </span>
                      </div>
                    </motion.div>
                  </GlassLayer>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </motion.div>

          {/* Growth Log */}
          <GlassLayer asChild intensity="strong">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="p-6"
            >
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp size={16} className="text-accent" />
                <h3 className="text-sm font-semibold text-text">成长日志</h3>
              </div>

              <div className="relative pl-4">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-accent/40 via-primary/20 to-glass-border" />
                <div className="space-y-5">
                  {growthLogs.map((log, index) => {
                    const colors = typeColors[log.type];
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: 0.3 + index * 0.08,
                          duration: 0.4,
                        }}
                        className="relative flex items-start gap-3"
                      >
                        <div
                          className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                          style={{
                            borderColor: colorMix(colors.text, 0.25),
                            backgroundColor: colorMix(colors.bg, 0.15),
                          }}
                        >
                          <Check size={10} style={{ color: colors.text }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-3xs text-text-subtle">
                              {log.date}
                            </span>
                            <span
                              className="text-4xs px-1.5 py-0.5 rounded-full"
                              style={{
                                color: colors.text,
                                backgroundColor: colorMix(colors.bg, 0.15),
                              }}
                            >
                              {typeLabels[log.type]}
                            </span>
                            <span className="text-sm font-medium text-text">
                              {log.title}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">
                            {log.detail}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </GlassLayer>
        </div>
      </div>

      {/* Submit New Skill Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="教时墨新技能"
        description="描述你希望时墨学会的能力，时墨会自动制定学习计划"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={!newSkillName.trim()}>
              提交需求
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="技能名称"
            placeholder="例如：照顾多肉植物、家庭摄影..."
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">
              详细描述
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-xl bg-[var(--color-gray-950)] border border-[var(--color-gray-900)] text-sm text-text placeholder:text-text-subtle/50 focus:outline-none focus:border-accent/30 transition-colors resize-none focus-ring"
              rows={3}
              placeholder="描述你希望时墨学会的具体能力..."
              value={newSkillDesc}
              onChange={(e) => setNewSkillDesc(e.target.value)}
            />
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-gray-950)] border border-[var(--color-gray-900)]">
            <div className="flex items-center gap-2 text-2xs text-text-subtle">
              <Lightbulb size={12} className="text-life-amber" />
              <span>时墨会分析需求，制定学习计划，并在技能工坊中展示进度</span>
            </div>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}
