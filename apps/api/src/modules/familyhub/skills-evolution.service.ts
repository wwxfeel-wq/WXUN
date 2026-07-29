import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentToolResult } from './agent-tool.service';

/** Optional evaluation context used to compute skill experience. */
export interface ExperienceEvaluation {
  /** 0-1 score indicating how completely the user request was fulfilled. */
  completionScore?: number;
  /** 0-1 score indicating the semantic quality / depth of the interaction. */
  qualityScore?: number;
  /** Concrete tool execution result produced while serving the user. */
  toolResult?: AgentToolResult;
}

/**
 * 技能等级分层
 *
 * - basic:        Lv.1-2  基础回答，简洁
 * - detailed:     Lv.3-5  详细回答，带建议
 * - professional: Lv.6-8  专业回答，带案例和深度分析
 * - expert:       Lv.9-10 专家级别，带创新建议和跨领域联想
 */
export type SkillTier = 'basic' | 'detailed' | 'professional' | 'expert';

/**
 * 技能进化结果（用于日志/调试）
 */
export interface SkillEvolutionResult {
  skillId: string;
  skillName: string;
  previousLevel: number;
  previousProgress: number;
  newLevel: number;
  newProgress: number;
  expGained: number;
  leveledUp: boolean;
}

/** 技能精简类型（用于内部方法传参，避免直接依赖 Prisma 生成类型的 JSON 字段） */
interface SkillSummary {
  id: string;
  name: string;
  level: number;
  progress: number;
  status: string;
  tags: Prisma.JsonValue | null;
  examples: Prisma.JsonValue | null;
}

/**
 * 技能进化服务
 *
 * 职责：
 * 1. 每次 Agent 被调用时，检查相关 Skill 的等级和进度
 * 2. Skill 等级影响 AI 系统提示词的质量（高等级 = 更专业详细）
 * 3. 每次成功对话后增加 Skill 经验值（progress +5~15）
 * 4. progress 达到 100 后自动升级（level +1, progress 重置）
 */
@Injectable()
export class SkillsEvolutionService {
  private readonly logger = new Logger(SkillsEvolutionService.name);

  /** 技能等级上限 */
  private readonly MAX_LEVEL = 10;

  /** 每次经验值增量下限 */
  private readonly MIN_EXP = 5;

  /** 每次经验值增量上限 */
  private readonly MAX_EXP = 15;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // 系统提示词增强
  // ============================================================

  /**
   * 根据技能等级生成系统提示词增强片段
   *
   * 将该 Agent 下所有技能的平均等级映射到分层提示词，
   * 注入到原系统提示词之后，引导 AI 以对应深度作答。
   *
   * @param agentCode - Agent 编码
   * @returns 提示词增强片段（无技能时返回空字符串）
   */
  async buildSkillPrompt(agentCode: string): Promise<string> {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code: agentCode },
      include: { skills: true },
    });

    if (!agent || !agent.skills || agent.skills.length === 0) {
      return '';
    }

    // 取该 Agent 下技能的平均等级
    const avgLevel = Math.round(
      agent.skills.reduce((sum, s) => sum + s.level, 0) / agent.skills.length,
    );
    const tier = this.getTier(avgLevel);

    // 拼接技能清单
    const skillList = agent.skills
      .map((s) => `${s.name}(Lv.${s.level})`)
      .join('、');

    // 通用对话准则（所有等级共用）
    // 注意：这里只约束「怎么把话说好」，绝不覆盖 Agent 自身的专家人格与语气。
    // 各 Agent 的身份、语气、专业视角由其 systemPrompt 定义（见 AGENT_DEFINITIONS）。
    const naturalStyle =
      `\n\n【对话准则】\n` +
      `1. 保持你自己的专家身份与语气，不要切换成通用助手腔，不要模仿其他 Agent\n` +
      `2. 先给出真正有用的判断和方案，不复述用户的话，不说"这是个好问题"这类开场\n` +
      `3. 建议必须具体到能直接执行：给数字、给步骤、给时间点，不给"合理安排"这类原则\n` +
      `4. 长度贴合问题：简单问题 2-4 句；需要方案时 3-5 条要点，不写长文\n` +
      `5. 少用 Markdown 标题，要点用短横线即可；表情符号最多一个\n` +
      `6. 禁止堆叠网络梗与流行语，禁止用套话和空洞的情绪安慰填充篇幅`;

    const tierPrompts: Record<SkillTier, string> = {
      basic:
        `【技能状态】当前技能等级较低（平均 Lv.${avgLevel}），技能：${skillList}。` +
        `请用简洁、易懂的方式回答，避免过于专业的术语，给出基础可行的建议。` +
        naturalStyle,
      detailed:
        `【技能状态】当前技能等级中等（平均 Lv.${avgLevel}），技能：${skillList}。` +
        `请给出较详细的回答，并附带具体可执行的建议步骤。` +
        naturalStyle,
      professional:
        `【技能状态】当前技能等级较高（平均 Lv.${avgLevel}），技能：${skillList}。` +
        `请以专业视角回答，提供案例分析和深度解读，必要时给出多个方案对比。` +
        naturalStyle,
      expert:
        `【技能状态】当前技能等级已达专家级（平均 Lv.${avgLevel}），技能：${skillList}。` +
        `请以专家身份回答，给出创新性建议、跨领域联想，并前瞻性地指出潜在风险与机会。` +
        naturalStyle,
    };

    return tierPrompts[tier];
  }

  // ============================================================
  // 经验值增长与升级
  // ============================================================

  /**
   * 成功对话后增加技能经验值
   *
   * 根据消息内容匹配最相关的技能，增加 progress 5~15。
   * progress 达到 100 后自动升级（level +1, progress 重置）。
   *
   * @param agentCode - Agent 编码
   * @param message - 用户消息（用于匹配技能与计算经验值）
   * @returns 进化结果（无技能时返回 null）
   */
  async gainExperience(
    agentCode: string,
    message: string,
  ): Promise<SkillEvolutionResult | null> {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code: agentCode },
      include: { skills: true },
    });

    if (!agent || !agent.skills || agent.skills.length === 0) {
      return null;
    }

    // 计算经验值（基于消息长度和质量）
    const exp = this.calculateExp(message);

    // 找到最相关的技能，无匹配时回退到第一个技能
    const targetSkill =
      this.findMostRelevantSkill(agent.skills, message) ?? agent.skills[0];

    return this.addSkillExp(targetSkill, exp);
  }

  /**
   * 批量增加多个技能的经验值
   *
   * 当消息与多个技能相关时使用，每个技能获得较小经验值。
   *
   * @param agentCode - Agent 编码
   * @param message - 用户消息
   * @returns 进化结果列表
   */
  async gainExperienceBatch(
    agentCode: string,
    message: string,
  ): Promise<SkillEvolutionResult[]> {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code: agentCode },
      include: { skills: true },
    });

    if (!agent || !agent.skills || agent.skills.length === 0) {
      return [];
    }

    const baseExp = this.calculateExp(message);
    // 批量时每个技能经验值减半（避免过快升级）
    const expPerSkill = Math.max(this.MIN_EXP, Math.floor(baseExp / 2));

    const results: SkillEvolutionResult[] = [];
    for (const skill of agent.skills) {
      const result = await this.addSkillExp(skill, expPerSkill);
      results.push(result);
    }
    return results;
  }

  /**
   * 基于技能能力执行结果授予经验值
   *
   * 这是 Phase 4 推荐路径：经验不再按消息长度计算，而是依据工具执行
   * 是否成功、是否产出结构化数据、完成度评分等质量指标。
   *
   * @param agentCode - Agent 编码
   * @param abilityName - 被执行的技能能力名称
   * @param toolResult - 工具执行结果
   * @returns 进化结果（无技能时返回 null）
   */
  async gainExperienceFromToolResult(
    agentCode: string,
    abilityName: string,
    toolResult: AgentToolResult,
  ): Promise<SkillEvolutionResult | null> {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code: agentCode },
      include: { skills: true },
    });

    if (!agent || !agent.skills || agent.skills.length === 0) {
      return null;
    }

    const targetSkill =
      this.findMostRelevantSkill(agent.skills, abilityName) ?? agent.skills[0];
    const exp = this.calculateExp(abilityName, { toolResult });

    return this.addSkillExp(targetSkill, exp);
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 根据技能等级获取分层
   */
  private getTier(level: number): SkillTier {
    if (level <= 2) return 'basic';
    if (level <= 5) return 'detailed';
    if (level <= 8) return 'professional';
    return 'expert';
  }

  /**
   * 根据完成度、工具执行结果和交互质量计算经验值（5~15）
   *
   * 技能 invocation 路径优先使用 toolResult；普通对话回退到消息质量启发式。
   */
  private calculateExp(
    message: string,
    evaluation?: ExperienceEvaluation,
  ): number {
    let exp = this.MIN_EXP;

    if (evaluation?.toolResult) {
      const tr = evaluation.toolResult;
      if (tr.success) {
        exp += 7; // 成功执行基础分
        if (tr.data && Object.keys(tr.data).length > 0) {
          exp += 3; // 产生了结构化产出
        }
        const summaryLen = tr.summary?.length ?? 0;
        if (summaryLen > 20) {
          exp += 2; // 有有效总结
        }
        if (evaluation.completionScore !== undefined) {
          exp += Math.round(evaluation.completionScore * 3);
        }
      } else {
        exp += 2; // 从失败中学习，少量经验
      }
    } else {
      // 无工具结果时：基于消息质量（而非纯长度）
      const trimmed = message.trim();
      const len = trimmed.length;
      if (len >= 50) exp += 6;
      else if (len >= 30) exp += 4;
      else if (len >= 15) exp += 2;

      // 复杂性/提问奖励
      if (/[?？]|为什么|如何|怎样|建议|分析/.test(trimmed)) {
        exp += 2;
      }
    }

    return Math.min(this.MAX_EXP, exp);
  }

  /**
   * 将 Prisma 的 JSON 字段安全转换为字符串数组
   */
  private toStringArray(value: Prisma.JsonValue | null): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    return [];
  }

  /**
   * 找到与消息最相关的技能（基于 tags/examples 关键词匹配）
   *
   * 匹配逻辑：统计技能关键词在消息中出现的次数，越长关键词权重越高。
   * 无任何匹配时返回 null。
   */
  private findMostRelevantSkill(
    skills: SkillSummary[],
    message: string,
  ): SkillSummary | null {
    let bestSkill: SkillSummary | null = null;
    let bestScore = 0;

    for (const skill of skills) {
      // 汇总关键词：标签 + 示例 + 技能名
      const tags = this.toStringArray(skill.tags);
      const examples = this.toStringArray(skill.examples);
      const keywords = [...tags, ...examples, skill.name];

      let score = 0;
      for (const kw of keywords) {
        if (kw && message.includes(kw)) {
          // 越长的关键词权重越高（更具体）
          score += kw.length;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    return bestScore > 0 ? bestSkill : null;
  }

  /**
   * 给技能增加经验值，处理升级逻辑
   *
   * 升级规则：
   * - progress + exp >= 100 → level +1, progress 重置为 0
   * - 已达最高级（Lv.10）→ 保持 progress 100, status mastered
   * - 'new' 状态获得经验后转为 'learning'
   */
  private async addSkillExp(
    skill: SkillSummary,
    exp: number,
  ): Promise<SkillEvolutionResult> {
    const previousLevel = skill.level;
    const previousProgress = skill.progress;

    let newProgress = skill.progress + exp;
    let newLevel = skill.level;
    let newStatus = skill.status;
    let leveledUp = false;

    if (newProgress >= 100) {
      if (skill.level < this.MAX_LEVEL) {
        // 升级：等级 +1，进度重置
        newLevel = skill.level + 1;
        newProgress = 0;
        newStatus = newLevel >= this.MAX_LEVEL ? 'mastered' : 'learning';
        leveledUp = true;
        this.logger.log(
          `技能"${skill.name}"升级！Lv.${skill.level} → Lv.${newLevel}`,
        );
      } else {
        // 已达最高级，保持满进度
        newProgress = 100;
        newStatus = 'mastered';
        this.logger.debug(
          `技能"${skill.name}"已达最高级 Lv.${this.MAX_LEVEL}，经验值不再增长`,
        );
      }
    } else if (skill.status === 'new') {
      // 新技能获得首次经验，转为学习中
      newStatus = 'learning';
    }

    await this.prisma.skill.update({
      where: { id: skill.id },
      data: {
        progress: newProgress,
        level: newLevel,
        status: newStatus,
      },
    });

    return {
      skillId: skill.id,
      skillName: skill.name,
      previousLevel,
      previousProgress,
      newLevel,
      newProgress,
      expGained: exp,
      leveledUp,
    };
  }
}
