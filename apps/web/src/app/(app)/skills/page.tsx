"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Home,
  ChefHat,
  Wrench,
  ShoppingCart,
  Plane,
  HeartPulse,
  GraduationCap,
  Users,
  Heart,
  Fish,
  Sprout,
  Sparkles,
  Plus,
  Clock,
  Check,
  Zap,
  Star,
  Lightbulb,
  ArrowRight,
  Loader2,
  BookOpen,
  PawPrint,
  TrendingUp,
  Smile,
  HandHeart,
  TreePine,
} from "lucide-react";
import {
  PageTransition,
  StaggerContainer,
  StaggerItem,
} from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { GlassLayer } from "@/components/glass";
import { apiClient, swrFetcher } from "@/lib/api-client";
import useSWR from "swr";

const springHover = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
};

interface Skill {
  id: string;
  name: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  category: string;
  status: "mastered" | "learning";
  color: string;
  glowColor: string;
  description: string;
  examples: string[];
  tags: string[];
}

const initialSkills: Skill[] = [
  {
    id: "1",
    name: "生活管家",
    icon: Home,
    category: "生活",
    status: "mastered",
    color: "var(--color-highlight)",
    glowColor: "var(--color-highlight-glow)",
    description: "管理家庭日常事务，优化生活流程，让家务更高效。",
    examples: [
      "根据家庭成员作息自动生成清洁计划",
      "提醒换季衣物整理",
      "优化洗衣晾衣时间安排",
    ],
    tags: ["日程", "清洁", "整理"],
  },
  {
    id: "2",
    name: "菜谱推荐",
    icon: ChefHat,
    category: "饮食",
    status: "mastered",
    color: "var(--color-orange)",
    glowColor: "var(--color-orange-glow)",
    description: "结合家庭口味、营养需求和冰箱库存，推荐最适合的菜谱。",
    examples: [
      "今晚做青椒炒蛋，预计18分钟",
      "根据爸爸高血压推荐低钠食谱",
      "冰箱还剩西红柿，推荐番茄牛腩",
    ],
    tags: ["烹饪", "营养", "食材"],
  },
  {
    id: "3",
    name: "维修助手",
    icon: Wrench,
    category: "居家",
    status: "learning",
    color: "var(--color-secondary)",
    glowColor: "var(--color-secondary-glow)",
    description: "根据家电型号和故障现象，提供针对性维修方案。",
    examples: [
      "美的空调E1故障：检查室内外机通信线",
      "更换马桶进水阀的3个步骤",
      "净水器滤芯更换周期提醒",
    ],
    tags: ["家电", "水电", "工具"],
  },
  {
    id: "4",
    name: "购物顾问",
    icon: ShoppingCart,
    category: "生活",
    status: "mastered",
    color: "var(--color-cyan)",
    glowColor: "var(--color-cyan-glow)",
    description: "追踪家庭库存，预测需求，在最佳时机推荐购买。",
    examples: [
      "纸巾库存不足，本周超市有促销",
      "宝宝奶粉还剩7天量，建议提前购买",
      "根据历史记录生成月度采购清单",
    ],
    tags: ["采购", "库存", "比价"],
  },
  {
    id: "5",
    name: "旅行规划",
    icon: Plane,
    category: "出行",
    status: "mastered",
    color: "var(--color-purple)",
    glowColor: "var(--color-purple-glow)",
    description: "根据家庭预算、成员偏好和季节，规划完美的家庭旅行。",
    examples: [
      "春节云南5日游：人均预算3000元",
      "适合带老人和孩子的温泉度假村",
      "根据孩子假期自动推荐周边游",
    ],
    tags: ["攻略", "预算", "亲子"],
  },
  {
    id: "6",
    name: "健康监测",
    icon: HeartPulse,
    category: "健康",
    status: "learning",
    color: "var(--color-error)",
    glowColor: "var(--color-rose-glow)",
    description: "记录家庭成员健康数据，提供个性化健康建议。",
    examples: [
      "妈妈本周血压偏高，建议减少盐分摄入",
      "孩子近视防控：每日户外活动提醒",
      "老人用药时间提醒和剂量核对",
    ],
    tags: ["体检", "用药", "运动"],
  },
  {
    id: "7",
    name: "学习辅导",
    icon: GraduationCap,
    category: "教育",
    status: "mastered",
    color: "var(--color-secondary)",
    glowColor: "var(--color-secondary-glow)",
    description: "根据孩子学习进度和薄弱点，制定个性化学习计划。",
    examples: [
      "三年级数学：分数加减法专项练习",
      "根据错题本生成周末复习计划",
      "推荐适合8岁孩子的科普读物",
    ],
    tags: ["作业", "阅读", "兴趣"],
  },
  {
    id: "8",
    name: "家庭关系",
    icon: Users,
    category: "家庭",
    status: "mastered",
    color: "var(--color-highlight)",
    glowColor: "var(--color-highlight-glow)",
    description: "分析家庭成员互动模式，促进更和谐的亲子关系和夫妻关系。",
    examples: [
      "本周家庭沟通质量评分：85分",
      "建议周末安排一次全家桌游时间",
      "记录孩子情绪变化，及时发现异常",
    ],
    tags: ["沟通", "活动", "情绪"],
  },
  {
    id: "9",
    name: "老人陪伴",
    icon: Heart,
    category: "关怀",
    status: "learning",
    color: "var(--color-error)",
    glowColor: "var(--color-rose-glow)",
    description: "关注老人身心健康，提供防跌倒、防诈骗等安全提醒。",
    examples: [
      "老人今日步数偏少，建议电话关心",
      "识别疑似诈骗电话，自动提醒家人",
      "推荐适合老人的晨练活动和社交圈",
    ],
    tags: ["安全", "陪伴", "健康"],
  },
  {
    id: "10",
    name: "宠物护理",
    icon: Fish,
    category: "宠物",
    status: "learning",
    color: "var(--color-success)",
    glowColor: "var(--color-success-bg)",
    description: "管理宠物健康档案，提醒疫苗、驱虫和日常护理。",
    examples: [
      "狗狗下周该打狂犬疫苗了",
      "根据品种推荐每日运动量",
      "宠物生日提醒和纪念照片整理",
    ],
    tags: ["疫苗", "喂养", "美容"],
  },
  {
    id: "11",
    name: "成长记录",
    icon: Sprout,
    category: "成长",
    status: "mastered",
    color: "var(--color-success)",
    glowColor: "var(--color-success-bg)",
    description: "记录孩子成长里程碑，生成成长时间线和成长报告。",
    examples: [
      "宝宝第一次走路：2024年3月15日",
      "本月身高增长2cm，高于平均水平",
      "自动生成年度成长纪念册",
    ],
    tags: ["里程碑", "身高", "相册"],
  },
];

const categoryOptions = [
  { value: "生活", color: "var(--color-highlight)" },
  { value: "饮食", color: "var(--color-orange)" },
  { value: "居家", color: "var(--color-secondary)" },
  { value: "出行", color: "var(--color-purple)" },
  { value: "健康", color: "var(--color-error)" },
  { value: "教育", color: "var(--color-secondary)" },
  { value: "家庭", color: "var(--color-highlight)" },
  { value: "关怀", color: "var(--color-error)" },
  { value: "宠物", color: "var(--color-success)" },
  { value: "成长", color: "var(--color-success)" },
];

const growthHistory = [
  {
    date: "2024.06",
    title: "学会基础生活管理",
    color: "var(--color-highlight)",
    detail: "掌握家庭日程安排、清洁提醒等基础能力",
  },
  {
    date: "2024.08",
    title: "掌握菜谱推荐",
    color: "var(--color-orange)",
    detail: "结合冰箱库存和家庭口味进行智能推荐",
  },
  {
    date: "2024.10",
    title: "学会旅行规划",
    color: "var(--color-purple)",
    detail: "根据预算和偏好生成完整行程方案",
  },
  {
    date: "2024.12",
    title: "学会家庭收纳",
    color: "var(--color-highlight)",
    detail: "学习日本收纳法，优化家庭储物空间",
  },
  {
    date: "2025.01",
    title: "学会家电维修",
    color: "var(--color-secondary)",
    detail: "掌握常见家电故障诊断和基础维修",
  },
  {
    date: "2025.03",
    title: "掌握健康监测",
    color: "var(--color-error)",
    detail: "建立家庭成员健康档案和预警机制",
  },
  {
    date: "2025.05",
    title: "学会老人陪伴",
    color: "var(--color-error)",
    detail: "学习老年心理学和防诈骗知识库",
  },
];

// Icon name → component mapping for API-returned skills
const iconMap: Record<
  string,
  React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>
> = {
  Home,
  ChefHat,
  Wrench,
  ShoppingCart,
  Plane,
  HeartPulse,
  GraduationCap,
  Users,
  Heart,
  Fish,
  Sprout,
  Sparkles,
  BookOpen,
  PawPrint,
  TrendingUp,
  Smile,
  HandHeart,
  TreePine,
};

interface APISkill {
  id: string;
  name: string;
  description?: string;
  level: number;
  status: "mastered" | "learning" | "new" | "updated";
  progress?: number;
  sourceAgent: string;
  sourceAgentCode?: string;
  icon: string;
  color: string;
  category?: string;
  tags?: string[];
  examples?: string[];
}

export default function SkillsPage() {
  // Fetch skills from backend API
  const { data: apiSkills, mutate } = useSWR<APISkill[]>(
    "family-hub/skills",
    swrFetcher,
  );
  const [learningIds, setLearningIds] = React.useState<Set<string>>(new Set());

  // Merge API skills with local fallback
  const skills: Skill[] = React.useMemo(() => {
    if (apiSkills && apiSkills.length > 0) {
      return apiSkills.map((s) => {
        const IconComp = iconMap[s.icon] || Star;
        return {
          id: s.id,
          name: s.name,
          icon: IconComp,
          category: s.category || "生活",
          status: s.status === "mastered" ? "mastered" : "learning",
          color: s.color,
          glowColor: `color-mix(in srgb, ${s.color}, transparent 80%)`,
          description: s.description || "",
          examples: s.examples || [],
          tags: s.tags || [],
        };
      });
    }
    return initialSkills;
  }, [apiSkills]);

  const handleLearn = async (skillId: string) => {
    setLearningIds((prev) => new Set(prev).add(skillId));
    try {
      await apiClient.post(`family-hub/skills/${skillId}/learn`);
      await mutate();
    } catch {
      // ignore - data will refresh on next poll
    } finally {
      setLearningIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  const [modalOpen, setModalOpen] = React.useState(false);
  const [newSkillName, setNewSkillName] = React.useState("");
  const [newSkillCategory, setNewSkillCategory] = React.useState("生活");
  const [newSkillStatus, setNewSkillStatus] = React.useState<
    "mastered" | "learning"
  >("learning");
  const [expandedSkill, setExpandedSkill] = React.useState<string | null>(null);

  const handleAddSkill = () => {
    if (!newSkillName.trim()) return;
    const categoryColor =
      categoryOptions.find((c) => c.value === newSkillCategory)?.color ??
      "var(--color-secondary)";
    const skill: Skill = {
      id: `skill-${Date.now()}`,
      name: newSkillName.trim(),
      icon: Star,
      category: newSkillCategory,
      status: newSkillStatus,
      color: categoryColor,
      glowColor: `color-mix(in srgb, ${categoryColor}, transparent 80%)`,
      description: "用户自定义技能，时墨正在学习中...",
      examples: ["等待积累使用数据"],
      tags: ["自定义"],
    };
    setLocalSkills((prev) => [...prev, skill]);
    setNewSkillName("");
    setNewSkillCategory("生活");
    setNewSkillStatus("learning");
    setModalOpen(false);
  };

  // Keep a local copy for the add-skill feature
  const [localSkills, setLocalSkills] = React.useState<Skill[]>([]);
  const allSkills = [...skills, ...localSkills];

  const toggleExpand = (id: string) => {
    setExpandedSkill((prev) => (prev === id ? null : id));
  };

  const masteredCount = allSkills.filter((s) => s.status === "mastered").length;

  return (
    <PageTransition>
      <div className="w-full min-h-screen px-6 sm:px-12 lg:px-20 py-8 pb-32">
        <div className="max-w-5xl mx-auto">
          {/* ===== Header ===== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-2">
              <GlassLayer asChild intensity="strong">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl animate-float">
                  <Zap className="h-5 w-5 text-accent" />
                </span>
              </GlassLayer>
              <div>
                <h1 className="text-2xl font-display font-medium text-text">
                  时墨 Skills
                </h1>
                <p className="text-sm text-text-muted">
                  时墨正在持续学习这个家庭
                </p>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-4 mt-4">
              <GlassLayer asChild intensity="default">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-2"
                >
                  <Sparkles size={14} className="text-accent" />
                  <span className="text-xs text-text-muted">
                    已掌握{" "}
                    <span className="text-text font-medium">
                      {masteredCount}
                    </span>{" "}
                    项 · 学习中{" "}
                    <span className="text-text font-medium">
                      {allSkills.length - masteredCount}
                    </span>{" "}
                    项
                  </span>
                </motion.div>
              </GlassLayer>
              <GlassLayer asChild intensity="default">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="inline-flex items-center gap-2 px-4 py-2"
                >
                  <Lightbulb size={14} className="text-life-amber" />
                  <span className="text-xs text-text-muted">
                    最近新增: <span className="text-text">家庭收纳</span> ·{" "}
                    <span className="text-text">家电维修</span>
                  </span>
                </motion.div>
              </GlassLayer>
            </div>
          </motion.div>

          {/* ===== Skills Grid ===== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-text">技能掌握</h2>
              <Badge variant="outline">
                {masteredCount} / {skills.length} 已掌握
              </Badge>
            </div>
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allSkills.map((skill) => {
                const Icon = skill.icon;
                const isExpanded = expandedSkill === skill.id;
                const isLearning = learningIds.has(skill.id);
                return (
                  <StaggerItem key={skill.id}>
                    <SkillCard
                      skill={skill}
                      icon={<Icon size={20} style={{ color: skill.color }} />}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(skill.id)}
                      onLearn={() => handleLearn(skill.id)}
                      isLearning={isLearning}
                    />
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </motion.div>

          {/* ===== Skill Growth History ===== */}
          <GlassLayer asChild intensity="strong">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.2,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="p-6 mb-10"
            >
              <div className="flex items-center gap-2 mb-5">
                <Clock size={16} className="text-accent" />
                <h3 className="text-sm font-semibold text-text">
                  技能成长历史
                </h3>
              </div>
              <div className="relative pl-4">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-accent/40 via-primary/20 to-glass-border" />
                <div className="space-y-5">
                  {growthHistory.map((item, index) => (
                    <motion.div
                      key={item.date + item.title}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.08, duration: 0.4 }}
                      className="relative flex items-start gap-3"
                    >
                      <div
                        className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                        style={{
                          borderColor: `color-mix(in srgb, ${item.color}, transparent 62%)`,
                          backgroundColor: `color-mix(in srgb, ${item.color}, transparent 88%)`,
                        }}
                      >
                        <Check size={10} style={{ color: item.color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-3xs text-text-subtle">
                            {item.date}
                          </span>
                          <span className="text-sm font-medium text-text">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {item.detail}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </GlassLayer>

          {/* ===== Add Skill Button ===== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              新增技能
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ===== Add Skill Modal ===== */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="新增技能"
        description="教时墨一项新技能"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddSkill} disabled={!newSkillName.trim()}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="技能名称"
            placeholder="例如：园艺、摄影..."
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">分类</label>
            <div className="grid grid-cols-5 gap-2">
              {categoryOptions.map((opt) => {
                const active = newSkillCategory === opt.value;
                return (
                  <GlassLayer
                    asChild
                    intensity="default"
                    interactive
                    key={opt.value}
                  >
                    <motion.button
                      onClick={() => setNewSkillCategory(opt.value)}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springHover}
                      className="flex flex-col items-center gap-1 p-2.5 transition-colors focus-ring"
                      style={
                        active
                          ? {
                              borderColor: `color-mix(in srgb, ${opt.color}, transparent 70%)`,
                              backgroundColor: `color-mix(in srgb, ${opt.color}, transparent 85%)`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="text-xs"
                        style={{
                          color: active ? opt.color : "var(--color-gray-400)",
                        }}
                      >
                        {opt.value}
                      </span>
                    </motion.button>
                  </GlassLayer>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">状态</label>
            <div className="flex gap-2">
              {(
                [
                  { value: "learning", label: "学习中" },
                  { value: "mastered", label: "已掌握" },
                ] as const
              ).map((opt) => (
                <GlassLayer
                  asChild
                  intensity="default"
                  interactive
                  key={opt.value}
                >
                  <motion.button
                    onClick={() => setNewSkillStatus(opt.value)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 py-2.5 text-xs font-medium transition-colors focus-ring"
                    style={
                      newSkillStatus === opt.value
                        ? {
                            borderColor: "var(--color-secondary-glow)",
                            backgroundColor: "var(--color-info-bg)",
                            color: "var(--color-secondary)",
                          }
                        : undefined
                    }
                  >
                    {opt.label}
                  </motion.button>
                </GlassLayer>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}

function SkillCard({
  skill,
  icon,
  isExpanded,
  onToggle,
  onLearn,
  isLearning,
}: {
  skill: Skill;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onLearn: () => void;
  isLearning: boolean;
}) {
  return (
    <GlassLayer asChild intensity="default" interactive>
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        transition={springHover}
        onClick={onToggle}
        tabIndex={0}
        role="button"
        className="cursor-pointer relative overflow-hidden focus-ring"
        style={{
          boxShadow: `var(--shadow-md), inset 0 1px 0 var(--color-glass-highlight), 0 0 20px ${skill.glowColor}`,
          borderColor: `color-mix(in srgb, ${skill.color}, transparent 85%)`,
        }}
      >
        {/* Header */}
        <div className="p-4 flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
            style={{
              borderColor: `color-mix(in srgb, ${skill.color}, transparent 70%)`,
              backgroundColor: `color-mix(in srgb, ${skill.color}, transparent 88%)`,
            }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text">
                {skill.name}
              </span>
              <span
                className="text-3xs px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  color: skill.color,
                  backgroundColor: `color-mix(in srgb, ${skill.color}, transparent 85%)`,
                  border: `1px solid color-mix(in srgb, ${skill.color}, transparent 75%)`,
                }}
              >
                {skill.status === "mastered" ? "已掌握" : "学习中"}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 line-clamp-2">
              {skill.description}
            </p>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-text-subtle shrink-0 mt-1"
          >
            <ArrowRight size={14} />
          </motion.div>
        </div>

        {/* Expanded content */}
        <motion.div
          initial={false}
          animate={{
            height: isExpanded ? "auto" : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-4 pt-0 border-t border-border/50">
            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-3xs px-2 py-0.5 rounded-full bg-surface text-text-subtle border border-glass-border"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Examples */}
            <div className="mt-3 space-y-2">
              <p className="text-3xs text-text-subtle uppercase tracking-wider">
                能力示例
              </p>
              {skill.examples.map((example, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-accent/60 mt-1.5 shrink-0" />
                  <p className="text-xs text-text-muted leading-relaxed">
                    {example}
                  </p>
                </div>
              ))}
            </div>

            {/* Learn button */}
            {skill.status !== "mastered" && (
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onLearn();
                }}
                disabled={isLearning}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-3 w-full py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
                style={{
                  backgroundColor: `color-mix(in srgb, ${skill.color}, transparent 85%)`,
                  border: `1px solid color-mix(in srgb, ${skill.color}, transparent 70%)`,
                  color: skill.color,
                }}
              >
                {isLearning ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    学习中...
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    学习技能
                  </>
                )}
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </GlassLayer>
  );
}
