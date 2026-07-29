/**
 * Chinese label mappings for shared enums, reused across pages.
 */
import { MemoryType, MemoryVisibility, CapsuleStatus, CapsuleType, LifeTreeNodeType } from '@echolife/shared';

export const memoryTypeLabels: Record<string, string> = {
  [MemoryType.STORY]: '故事',
  [MemoryType.EVENT]: '事件',
  [MemoryType.RELATIONSHIP]: '关系',
  [MemoryType.EMOTION]: '情感',
  [MemoryType.ACHIEVEMENT]: '成就',
  [MemoryType.REFLECTION]: '反思',
  [MemoryType.DAILY]: '日常',
};

export const memoryVisibilityLabels: Record<string, string> = {
  [MemoryVisibility.PRIVATE]: '私密',
  [MemoryVisibility.FAMILY]: '家庭',
  [MemoryVisibility.PUBLIC]: '公开',
};

export const capsuleStatusLabels: Record<string, string> = {
  [CapsuleStatus.SEALED]: '已封存',
  [CapsuleStatus.OPENED]: '已开启',
  [CapsuleStatus.EXPIRED]: '已过期',
};

export const capsuleTypeLabels: Record<string, string> = {
  [CapsuleType.PERSONAL]: '个人',
  [CapsuleType.FAMILY]: '家庭',
  [CapsuleType.PUBLIC]: '公开',
};

export const lifeTreeNodeTypeLabels: Record<string, string> = {
  [LifeTreeNodeType.ROOT]: '根节点',
  [LifeTreeNodeType.CATEGORY]: '分类',
  [LifeTreeNodeType.EVENT]: '事件',
  [LifeTreeNodeType.PERSON]: '人物',
  [LifeTreeNodeType.PLACE]: '地点',
  [LifeTreeNodeType.THEME]: '主题',
};

/** Personality dimension metadata (Big Five). */
export const personalityDimensions = [
  { key: 'openness', label: '开放性', description: '对新经验的开放程度、想象力与创造力' },
  { key: 'conscientiousness', label: '尽责性', description: '自律、目标导向与组织能力' },
  { key: 'extraversion', label: '外向性', description: '社交活跃度与能量获取方式' },
  { key: 'agreeableness', label: '宜人性', description: '合作倾向、同理心与信任' },
  { key: 'neuroticism', label: '神经质', description: '情绪波动与稳定性程度' },
] as const;
