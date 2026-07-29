import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentToolService, AgentToolResult } from './agent-tool.service';
import { SkillsEvolutionService, SkillEvolutionResult } from './skills-evolution.service';
import type { InvokeSkillAbilityDto, SkillAbilityResult } from '@echolife/shared';

type SkillWithTools = Prisma.SkillGetPayload<{
  include: { skillTools: { include: { tool: true } } };
}>;

/**
 * Skill ability to MCP tool mapping.
 *
 * Each entry maps a human-readable ability name to the concrete MCP tool that
 * implements it, plus sensible default parameters. The mapping can be overridden
 * by the {@link InvokeSkillAbilityDto.parameters} payload at runtime.
 */
interface AbilityMapping {
  abilityName: string;
  toolName: string;
  defaultParameters: Record<string, unknown>;
}

/**
 * Default ability mappings per skill name.
 *
 * These cover the seeded skills in EchoLife. If a skill is not listed here,
 * we fall back to a direct lookup by abilityName against this table.
 */
const SKILL_ABILITY_MAP: Record<string, AbilityMapping[]> = {
  '家庭收纳': [
    {
      abilityName: '聊天整理',
      toolName: 'create_memory',
      defaultParameters: { title: '收纳整理笔记', type: 'daily' },
    },
    {
      abilityName: '自动分类',
      toolName: 'search_memories',
      defaultParameters: { query: '收纳 整理 分类' },
    },
    {
      abilityName: '人物画像',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'person', description: '家庭成员画像' },
    },
    {
      abilityName: '长期记忆',
      toolName: 'create_memory',
      defaultParameters: { title: '长期家庭记忆', type: 'story' },
    },
  ],
  '关系观察': [
    {
      abilityName: '互动检测',
      toolName: 'search_memories',
      defaultParameters: { query: '家人 互动 聊天' },
    },
    {
      abilityName: '亲密度分析',
      toolName: 'search_knowledge',
      defaultParameters: { term: '亲密关系 家庭' },
    },
    {
      abilityName: '关系图谱',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'person', description: '家庭成员' },
    },
    {
      abilityName: '预警系统',
      toolName: 'send_family_notification',
      defaultParameters: { title: '关系观察提醒', body: '最近家人互动较少，记得联系一下。' },
    },
    {
      abilityName: '深度建议',
      toolName: 'create_reminder',
      defaultParameters: { content: '安排一次家庭互动' },
    },
  ],
  '故事编织': [
    {
      abilityName: '事件提取',
      toolName: 'search_memories',
      defaultParameters: { query: '家庭 故事 事件' },
    },
    {
      abilityName: '故事生成',
      toolName: 'create_memory',
      defaultParameters: { title: '家庭故事', type: 'story' },
    },
    {
      abilityName: '时间轴',
      toolName: 'search_memories',
      defaultParameters: { query: '时间轴 重要时刻' },
    },
    {
      abilityName: '年度回忆',
      toolName: 'search_memories',
      defaultParameters: { query: '2024 年度 回忆' },
    },
    {
      abilityName: '叙事风格',
      toolName: 'create_memory',
      defaultParameters: { title: '叙事风格笔记', type: 'reflection' },
    },
  ],
  '情绪观察': [
    {
      abilityName: '情绪识别',
      toolName: 'create_memory',
      defaultParameters: { title: '情绪观察', type: 'emotion' },
    },
    {
      abilityName: '趋势分析',
      toolName: 'search_memories',
      defaultParameters: { query: '情绪 心情 变化', type: 'emotion' },
    },
    {
      abilityName: '主动提醒',
      toolName: 'send_family_notification',
      defaultParameters: { title: '情绪关怀提醒', body: '今天记得关心一下家人的情绪状态。' },
    },
    {
      abilityName: '情绪地图',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'concept', description: '家庭情绪地图' },
    },
    {
      abilityName: '关怀建议',
      toolName: 'create_reminder',
      defaultParameters: { content: '给家人一个温暖的问候' },
    },
  ],
  '时间胶囊': [
    {
      abilityName: '时刻识别',
      toolName: 'create_memory',
      defaultParameters: { title: '值得封存的时刻', type: 'event' },
    },
    {
      abilityName: '自动封装',
      toolName: 'create_memory',
      defaultParameters: { title: '时间胶囊', type: 'story' },
    },
    {
      abilityName: '定期开启',
      toolName: 'create_reminder',
      defaultParameters: { content: '开启时间胶囊' },
    },
    {
      abilityName: '家庭共享',
      toolName: 'send_family_notification',
      defaultParameters: { title: '时间胶囊共享', body: '一起打开这段封存的家庭记忆。', notifyFamilyMembers: true },
    },
    {
      abilityName: '回忆触发',
      toolName: 'search_memories',
      defaultParameters: { query: '回忆 重要时刻' },
    },
  ],
  '知识根系': [
    {
      abilityName: '实体提取',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'concept', description: '从记忆中提取的知识实体' },
    },
    {
      abilityName: '关系建立',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'person', description: '建立关系的家庭成员' },
    },
    {
      abilityName: '知识图谱',
      toolName: 'search_knowledge',
      defaultParameters: { term: '家庭知识' },
    },
    {
      abilityName: '画像深化',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'person', description: '深化家庭成员画像' },
    },
    {
      abilityName: '智能推理',
      toolName: 'search_knowledge',
      defaultParameters: { term: '家庭 推理' },
    },
  ],
  '菜谱推荐': [
    {
      abilityName: '根据食材推荐',
      toolName: 'search_memories',
      defaultParameters: { query: '菜谱 食材 推荐' },
    },
    {
      abilityName: '保存菜谱',
      toolName: 'create_memory',
      defaultParameters: { title: '新学到的菜谱', type: 'daily' },
    },
  ],
  '空气炸锅食谱': [
    {
      abilityName: '搜索空气炸锅食谱',
      toolName: 'search_memories',
      defaultParameters: { query: '空气炸锅 食谱' },
    },
    {
      abilityName: '记录空气炸锅做法',
      toolName: 'create_memory',
      defaultParameters: { title: '空气炸锅食谱', type: 'daily' },
    },
  ],
  '维修助手': [
    {
      abilityName: '故障诊断',
      toolName: 'search_knowledge',
      defaultParameters: { term: '家电 维修 故障' },
    },
    {
      abilityName: '记录维修笔记',
      toolName: 'create_memory',
      defaultParameters: { title: '维修记录', type: 'daily' },
    },
  ],
  '知识检索': [
    {
      abilityName: '搜索知识库',
      toolName: 'search_knowledge',
      defaultParameters: { term: '家庭知识' },
    },
    {
      abilityName: '保存知识实体',
      toolName: 'upsert_entity',
      defaultParameters: { type: 'concept', description: '知识库实体' },
    },
  ],
  '健康监测': [
    {
      abilityName: '记录健康数据',
      toolName: 'create_memory',
      defaultParameters: { title: '健康数据记录', type: 'daily' },
    },
    {
      abilityName: '查看健康记忆',
      toolName: 'search_memories',
      defaultParameters: { query: '健康 血压 血糖', type: 'daily' },
    },
    {
      abilityName: '健康提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '记录今天的健康数据' },
    },
  ],
  '旅行规划': [
    {
      abilityName: '搜索旅行记忆',
      toolName: 'search_memories',
      defaultParameters: { query: '旅行 出游' },
    },
    {
      abilityName: '旅行提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '准备旅行物品清单' },
    },
    {
      abilityName: '通知家人',
      toolName: 'send_family_notification',
      defaultParameters: { title: '旅行计划', body: '家庭旅行计划已更新，快来看看。', notifyFamilyMembers: true },
    },
  ],
  '老人陪伴': [
    {
      abilityName: '陪伴记录',
      toolName: 'create_memory',
      defaultParameters: { title: '陪伴记录', type: 'emotion' },
    },
    {
      abilityName: '用药提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '提醒家人按时服药' },
    },
    {
      abilityName: '关怀通知',
      toolName: 'send_family_notification',
      defaultParameters: { title: '老人关怀', body: '今天多陪陪家里的长辈哦。' },
    },
  ],
  '儿童成长追踪': [
    {
      abilityName: '记录成长里程碑',
      toolName: 'create_memory',
      defaultParameters: { title: '成长里程碑', type: 'achievement' },
    },
    {
      abilityName: '搜索成长记忆',
      toolName: 'search_memories',
      defaultParameters: { query: '成长 孩子', type: 'achievement' },
    },
  ],
  '情绪分析': [
    {
      abilityName: '记录情绪',
      toolName: 'create_memory',
      defaultParameters: { title: '情绪记录', type: 'emotion' },
    },
    {
      abilityName: '情绪记忆检索',
      toolName: 'search_memories',
      defaultParameters: { query: '情绪 心情', type: 'emotion' },
    },
    {
      abilityName: '情绪关怀提醒',
      toolName: 'send_family_notification',
      defaultParameters: { title: '情绪关怀', body: '家人可能需要一点关心。' },
    },
  ],
  '购物顾问': [
    {
      abilityName: '购物备忘',
      toolName: 'create_memory',
      defaultParameters: { title: '购物备忘', type: 'daily' },
    },
    {
      abilityName: '搜索购物记录',
      toolName: 'search_memories',
      defaultParameters: { query: '购物 支出' },
    },
  ],
  '宠物护理': [
    {
      abilityName: '宠物健康记录',
      toolName: 'create_memory',
      defaultParameters: { title: '宠物护理记录', type: 'daily' },
    },
    {
      abilityName: '宠物提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '给宠物喂食/驱虫/疫苗' },
    },
  ],
  '家庭财务管理': [
    {
      abilityName: '记账',
      toolName: 'create_memory',
      defaultParameters: { title: '支出记录', type: 'daily' },
    },
    {
      abilityName: '查看财务记忆',
      toolName: 'search_memories',
      defaultParameters: { query: '支出 记账 财务' },
    },
  ],
  '情绪倾听': [
    {
      abilityName: '倾听并记录',
      toolName: 'create_memory',
      defaultParameters: { title: '情绪倾诉', type: 'emotion' },
    },
    {
      abilityName: '情绪提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '照顾自己，做点让自己开心的事' },
    },
  ],
  '生活建议': [
    {
      abilityName: '建议备忘',
      toolName: 'create_memory',
      defaultParameters: { title: '生活建议', type: 'daily' },
    },
    {
      abilityName: '安排提醒',
      toolName: 'create_reminder',
      defaultParameters: { content: '执行生活建议' },
    },
  ],
  '叙事创作': [
    {
      abilityName: '素材搜索',
      toolName: 'search_memories',
      defaultParameters: { query: '故事 经历 回忆' },
    },
    {
      abilityName: '保存故事',
      toolName: 'create_memory',
      defaultParameters: { title: '家庭故事', type: 'story' },
    },
  ],
  '情感渲染': [
    {
      abilityName: '情感记录',
      toolName: 'create_memory',
      defaultParameters: { title: '情感渲染笔记', type: 'emotion' },
    },
  ],
};

/**
 * Skill Invocation Service
 *
 * Bridges the frontend-facing skills with concrete MCP tools. Each skill ability
 * is mapped to a real tool in the MCP Tool Registry, and invocation also grants
 * a small amount of skill experience so using abilities helps skills grow.
 */
@Injectable()
export class SkillsInvocationService {
  private readonly logger = new Logger(SkillsInvocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentToolService: AgentToolService,
    private readonly skillsEvolution: SkillsEvolutionService,
  ) {}

  /**
   * Invoke a skill ability by mapping it to a real MCP tool and executing it.
   *
   * @param userId - Current authenticated user
   * @param skillId - Skill database id
   * @param dto - Ability name and runtime parameters
   */
  async invoke(
    userId: string,
    skillId: string,
    dto: InvokeSkillAbilityDto,
  ): Promise<SkillAbilityResult> {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        agent: true,
        skillTools: {
          include: { tool: true },
        },
      },
    });

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }

    if (!skill.agent) {
      throw new BadRequestException(`Skill ${skill.name} 没有关联的 Agent`);
    }

    const mapping = this.resolveAbilityMapping(skill, dto.abilityName);
    if (!mapping) {
      throw new BadRequestException(
        `技能「${skill.name}」没有名为「${dto.abilityName}」的可执行能力（或该能力尚未解锁）`,
      );
    }

    const parameters = { ...mapping.defaultParameters, ...(dto.parameters ?? {}) };

    // Fill in dynamic placeholders from user-provided parameters
    if (parameters.title && typeof parameters.title === 'string' && dto.parameters?.title) {
      parameters.title = dto.parameters.title;
    }
    if (parameters.content && typeof parameters.content === 'string' && dto.parameters?.content) {
      parameters.content = dto.parameters.content;
    }
    if (parameters.query && typeof parameters.query === 'string' && dto.parameters?.query) {
      parameters.query = dto.parameters.query;
    }
    if (parameters.term && typeof parameters.term === 'string' && dto.parameters?.term) {
      parameters.term = dto.parameters.term;
    }
    if (parameters.name && typeof parameters.name === 'string' && dto.parameters?.name) {
      parameters.name = dto.parameters.name;
    }
    if (parameters.description && typeof parameters.description === 'string' && dto.parameters?.description) {
      parameters.description = dto.parameters.description;
    }

    const agentCode = skill.agent.code;

    this.logger.log(
      `Invoking ability "${dto.abilityName}" of skill "${skill.name}" via tool "${mapping.toolName}"`,
    );

    const toolResult: AgentToolResult = await this.agentToolService.executeTool(
      agentCode,
      userId,
      mapping.toolName,
      parameters,
    );

    // Grant experience based on tool execution quality, not message length
    let evolution: SkillEvolutionResult | null = null;
    try {
      evolution = await this.skillsEvolution.gainExperienceFromToolResult(
        agentCode,
        dto.abilityName,
        toolResult,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to grant skill exp after ability invocation: ${(error as Error).message}`,
      );
    }

    return {
      success: toolResult.success,
      abilityName: dto.abilityName,
      toolName: mapping.toolName,
      summary: toolResult.summary,
      data: toolResult.data,
      skillName: skill.name,
      skillLevel: skill.level,
      skillProgress: skill.progress,
      leveledUp: evolution?.leveledUp ?? false,
      expGained: evolution?.expGained ?? 0,
    };
  }

  /**
   * Return the executable abilities for a skill.
   *
   * Prioritizes database bindings (SkillTool) and filters out tools that are
   * locked at the current skill level. Falls back to the static seed map when
   * no database bindings exist.
   */
  async getAbilities(skillId: string): Promise<AbilityMapping[]> {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        skillTools: {
          include: { tool: true },
        },
      },
    });

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }

    if (skill.skillTools && skill.skillTools.length > 0) {
      return skill.skillTools
        .filter((st) => st.required || skill.level >= st.unlockLevel)
        .map((st) => ({
          abilityName: st.abilityName,
          toolName: st.tool.name,
          defaultParameters: (st.parameters as Record<string, unknown>) ?? {},
        }));
    }

    return SKILL_ABILITY_MAP[skill.name] ?? [];
  }

  private resolveAbilityMapping(
    skill: SkillWithTools,
    abilityName: string,
  ): AbilityMapping | undefined {
    // Phase 4: prefer database Skill -> Tool bindings with unlock level checks
    if (skill.skillTools && skill.skillTools.length > 0) {
      const binding = skill.skillTools.find(
        (st) =>
          st.abilityName === abilityName &&
          (st.required || skill.level >= st.unlockLevel),
      );
      if (binding) {
        return {
          abilityName: binding.abilityName,
          toolName: binding.tool.name,
          defaultParameters: (binding.parameters as Record<string, unknown>) ?? {},
        };
      }
    }

    // Fall back to the static seed map
    const bySkill = SKILL_ABILITY_MAP[skill.name] ?? [];
    const mapping = bySkill.find((m) => m.abilityName === abilityName);
    if (mapping) return mapping;

    // Global ability-name lookup across all static mappings
    for (const mappings of Object.values(SKILL_ABILITY_MAP)) {
      const fallback = mappings.find((m) => m.abilityName === abilityName);
      if (fallback) return fallback;
    }

    return undefined;
  }
}
