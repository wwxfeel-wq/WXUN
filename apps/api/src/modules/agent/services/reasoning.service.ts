import { Injectable, Logger } from '@nestjs/common';
import { LlmAdapterService } from '../../ai/services/llm-adapter.service';
import { ShimoPersonaService } from './shimo-persona.service';
import { AGENT_RUNTIME, AgentPlanStep, AgentToolCall } from '@echolife/shared';
import type { ToolSchema, LoadedUserContext, FamilyContext } from '../types/agent-runtime.types';

/** Context object passed to Reasoning */
export interface ReasoningContext {
  message: string;
  step: AgentPlanStep;
  planReasoning: string;
  userContext: LoadedUserContext;
  familyContext: FamilyContext;
  memoryContext: string;
  toolSchemas: ToolSchema[];
}

/**
 * Reasoning — performs Chain-of-Thought reasoning and decides whether
 * to invoke tools for a single plan step.
 *
 * It returns a reasoning trace plus any structured tool_calls the runtime
 * should execute. Tool schemas are provided to the LLM so it can decide
 * which tool (if any) to call and with what arguments.
 */
@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name);

  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly shimoPersona: ShimoPersonaService,
  ) {}

  /**
   * Given the current plan step, user message, memory context, and available
   * tool schemas, produce a chain-of-thought and a list of tool calls.
   */
  async reason(ctx: ReasoningContext): Promise<{ reasoning: string; toolCalls: AgentToolCall[] }> {
    const systemPrompt = this.shimoPersona.buildInnerPrompt(
      '你是推理助手（Reasoning）。请分析当前计划步骤，进行逐步思考（Chain-of-Thought），并决定是否需要调用工具。',
    );

    const schemaBlock = ctx.toolSchemas.length
      ? `可用工具及 JSON Schema：\n${JSON.stringify(
          ctx.toolSchemas.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
          null,
          2,
        )}`
      : '当前无可用工具';

    const familyBlock = this.formatFamilyContext(ctx.familyContext);

    const userPrompt = `用户消息：${ctx.message}

当前计划步骤：
- 目标：${ctx.step.goal}
- 可选工具：${ctx.step.tool ?? '未指定'}

规划分析：${ctx.planReasoning}

用户称呼：${ctx.userContext.nickname}

相关记忆：
${ctx.memoryContext || '暂无'}

${familyBlock}

${schemaBlock}

请输出 JSON：
{
  "reasoning": "逐步思考过程：1) 当前步骤要达成什么；2) 已有信息是否足够；3) 是否需要调用工具以及调用哪个工具；4) 如何继续。控制在 3-5 句。",
  "tool_calls": [
    { "tool": "工具名称", "args": { /* 符合对应 schema 的参数 */ }, "reasoning": "为什么调用" }
  ]
}

约束：
-  tool_calls 最多 ${AGENT_RUNTIME.MAX_TOOL_CALLS_PER_TURN} 个。
-  只有在确实需要外部数据或动作时才调用工具。
-  如果没有合适的工具，tool_calls 留空数组。`;

    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 1536 },
      );

      const parsed = this.parseJsonResponse<{
        reasoning?: string;
        tool_calls?: unknown[];
      }>(result.content);

      const toolCalls: AgentToolCall[] = (parsed?.tool_calls ?? [])
        .map((raw) => this.normalizeToolCall(raw))
        .filter((tc): tc is AgentToolCall => tc !== null && Boolean(tc.tool))
        .slice(0, AGENT_RUNTIME.MAX_TOOL_CALLS_PER_TURN);

      return {
        reasoning: parsed?.reasoning ?? '直接回应用户',
        toolCalls,
      };
    } catch (error) {
      this.logger.warn(`Reasoning failed: ${(error as Error).message}`);
      return {
        reasoning: '直接回应用户',
        toolCalls: [],
      };
    }
  }

  private formatFamilyContext(familyContext: ReasoningContext['familyContext']): string {
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

  private normalizeToolCall(raw: unknown): AgentToolCall | null {
    const tc = raw as Record<string, unknown>;
    if (!tc.tool || typeof tc.tool !== 'string') return null;
    return {
      tool: tc.tool,
      args: tc.args && typeof tc.args === 'object' ? (tc.args as Record<string, unknown>) : {},
      reasoning: tc.reasoning ? String(tc.reasoning) : undefined,
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
