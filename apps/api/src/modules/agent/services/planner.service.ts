import { Injectable, Logger } from '@nestjs/common';
import { LlmAdapterService } from '../../ai/services/llm-adapter.service';
import { ShimoPersonaService } from './shimo-persona.service';
import { AgentPlan, AgentPlanStep, AGENT_RUNTIME } from '@echolife/shared';
import type { LoadedUserContext, FamilyContext } from '../types/agent-runtime.types';

/** Context object passed to the Planner */
export interface PlannerContext {
  message: string;
  mode: string;
  availableTools: string[];
  userContext: LoadedUserContext;
  familyContext: FamilyContext;
}

/**
 * Planner — decomposes the user's input into a small set of actionable steps.
 *
 * The LLM is given the user message, family context, memory context, and
 * available tool schemas. It returns a plan with goals and optional tool
 * bindings. The plan is kept simple (max 5 steps) so the runtime stays
 * responsive while still being observable.
 */
@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly shimoPersona: ShimoPersonaService,
  ) {}

  /**
   * Generate a plan for the current turn.
   */
  async plan(ctx: PlannerContext): Promise<AgentPlan> {
    const systemPrompt = this.shimoPersona.buildInnerPrompt(
      '你是规划助手（Planner）。分析用户需求，结合家庭上下文和可用工具，制定一个简短的执行计划。',
    );

    const toolList = ctx.availableTools.length
      ? `可用工具：${ctx.availableTools.join('、')}`
      : '当前无可用工具';

    const familyBlock = this.formatFamilyContext(ctx.familyContext);

    const userPrompt = `用户需求：${ctx.message}
对话模式：${ctx.mode}
用户称呼：${ctx.userContext.nickname}

相关记忆：
${ctx.userContext.formattedMemories}

近期对话：
${ctx.userContext.formattedRecentMessages}

${familyBlock}

${toolList}

请制定执行计划，只返回 JSON，格式如下：
{
  "reasoning": "简短分析用户意图、家庭上下文和选择策略",
  "steps": [
    { "id": "step-1", "step": 1, "goal": "步骤目标", "tool": "可选的工具名称", "dependsOn": [] }
  ]
}

约束：
- 步骤最多 ${AGENT_RUNTIME.MAX_PLAN_STEPS} 个。
- 只有在确实需要时才指定 tool。
- dependsOn 填写前置步骤的 id，无依赖留空数组。`;

    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 1024 },
      );

      const parsed = this.parseJsonResponse<{ reasoning?: string; steps?: unknown[] }>(
        result.content,
      );

      const steps: AgentPlanStep[] = (parsed?.steps ?? [])
        .map((s, idx) => this.normalizeStep(s, idx))
        .filter((s): s is AgentPlanStep => Boolean(s.goal))
        .slice(0, AGENT_RUNTIME.MAX_PLAN_STEPS);

      return {
        reasoning: parsed?.reasoning ?? '直接回应用户',
        steps,
      };
    } catch (error) {
      this.logger.warn(`Planning failed: ${(error as Error).message}`);
      return {
        reasoning: '直接回应用户',
        steps: [
          {
            id: 'step-1',
            step: 1,
            goal: '理解并回应用户',
            dependsOn: [],
          },
        ],
      };
    }
  }

  private formatFamilyContext(familyContext: PlannerContext['familyContext']): string {
    if (familyContext.families.length === 0) {
      return '家庭上下文：暂无家庭信息';
    }

    const familyLines = familyContext.families.map(
      (f) => `- 家庭「${f.name}」（角色：${f.role}）`,
    );
    const memberLines = familyContext.members.map(
      (m) => `  - ${m.nickname ?? '家庭成员'}`,
    );

    return `家庭上下文：\n${familyLines.join('\n')}\n${memberLines.join('\n')}\n\n知识图谱摘要：\n${familyContext.knowledgeGraphSummary}`;
  }

  private normalizeStep(raw: unknown, idx: number): AgentPlanStep {
    const s = raw as Record<string, unknown>;
    return {
      id: typeof s.id === 'string' ? s.id : `step-${idx + 1}`,
      step: typeof s.step === 'number' ? s.step : idx + 1,
      goal: String(s.goal ?? ''),
      tool: s.tool ? String(s.tool) : undefined,
      dependsOn: Array.isArray(s.dependsOn)
        ? s.dependsOn.filter((x): x is string => typeof x === 'string')
        : [],
    };
  }

  private parseJsonResponse<T>(text: string): T | null {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned) as T;
    } catch {
      this.logger.debug(`Failed to parse JSON response: ${text.slice(0, 200)}`);
      return null;
    }
  }
}
