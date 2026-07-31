import { Injectable, Logger } from '@nestjs/common';
import {
  LlmAdapterService,
  ChatMessage,
} from '../../../ai/services/llm-adapter.service';
import { WebSearchService } from '../../../ai/services/web-search.service';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/** analyze_user_need 返回的需求分析结构 */
interface UserNeedAnalysis {
  surfaceNeed: string;
  deepNeed: string;
  emotion: string;
  suggestedTools: string[];
}

/** synthesize_response 返回的回应建议结构 */
interface ResponseSuggestion {
  direction: string;
  keyPoints: string[];
  tone: string;
}

/**
 * 深度研究 MCP 工具集。
 *
 * 提供更高层次的研究与综合能力：通过 LLM 分析用户深层需求，
 * 并将多源信息（研究数据、记忆上下文）综合成人性化的回应建议。
 */
@Injectable()
export class ResearchTools {
  private readonly logger = new Logger(ResearchTools.name);

  constructor(
    private readonly webSearchService: WebSearchService,
    private readonly llmAdapter: LlmAdapterService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      this.analyzeUserNeed(),
      this.synthesizeResponse(),
    ];
  }

  // ============================================================
  // analyze_user_need —— 分析用户深层需求
  // ============================================================

  private analyzeUserNeed(): McpToolDefinition {
    return {
      name: 'analyze_user_need',
      description: '使用 LLM 深度分析用户消息，挖掘表层需求之下的深层需求与情绪，并给出建议工具链',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '用户发送的原始消息',
          },
          context: {
            type: 'string',
            description: '可选的上下文信息，如历史对话或当前场景',
          },
        },
        required: ['message'],
      },
      handler: async (args, ctx) => this.handleAnalyzeUserNeed(args, ctx),
    };
  }

  private async handleAnalyzeUserNeed(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const message = String(args.message ?? ctx.message ?? '').trim();
    if (!message) {
      return {
        tool: 'analyze_user_need',
        success: false,
        summary: '请提供用户消息内容',
      };
    }

    const context = typeof args.context === 'string' ? args.context.trim() : '';

    try {
      const systemPrompt = this.buildAnalyzeSystemPrompt();
      const userPrompt = this.buildAnalyzeUserPrompt(message, context);

      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 768 },
      );

      const analysis = this.parseJsonResponse<UserNeedAnalysis>(result.content);

      if (!analysis) {
        // LLM 返回无法解析时，使用降级分析
        const fallback = this.fallbackAnalyze(message);
        return {
          tool: 'analyze_user_need',
          success: true,
          summary:
            `表层需求：${fallback.surfaceNeed}；` +
            `深层需求：${fallback.deepNeed}；` +
            `情绪状态：${fallback.emotion}`,
          data: fallback,
        };
      }

      // 规范化字段
      const normalized: UserNeedAnalysis = {
        surfaceNeed: analysis.surfaceNeed ?? '未能识别',
        deepNeed: analysis.deepNeed ?? '未能识别',
        emotion: analysis.emotion ?? 'neutral',
        suggestedTools: Array.isArray(analysis.suggestedTools)
          ? analysis.suggestedTools.filter((t) => typeof t === 'string')
          : [],
      };

      const summary =
        `表层需求：${normalized.surfaceNeed}；` +
        `深层需求：${normalized.deepNeed}；` +
        `情绪状态：${normalized.emotion}；` +
        `建议工具：${normalized.suggestedTools.join('、') || '无'}`;

      return {
        tool: 'analyze_user_need',
        success: true,
        summary,
        data: normalized,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`analyze_user_need 失败：${msg}`);
      // 出错时降级返回基础分析
      const fallback = this.fallbackAnalyze(message);
      return {
        tool: 'analyze_user_need',
        success: true,
        summary:
          `表层需求：${fallback.surfaceNeed}；` +
          `深层需求：${fallback.deepNeed}；` +
          `情绪状态：${fallback.emotion}（LLM 不可用，使用基础分析）`,
        data: fallback,
      };
    }
  }

  // ============================================================
  // synthesize_response —— 综合多源信息生成回应建议
  // ============================================================

  private synthesizeResponse(): McpToolDefinition {
    return {
      name: 'synthesize_response',
      description: '将研究数据与记忆上下文综合成人性化的回应建议，包括回应方向、关键要点与语气建议',
      parameters: {
        type: 'object',
        properties: {
          userMessage: {
            type: 'string',
            description: '用户的原始消息',
          },
          researchData: {
            type: 'string',
            description: '通过深度研究或其他工具获取的研究数据/搜索结果',
          },
          memoryContext: {
            type: 'string',
            description: '可选的记忆上下文，如用户历史记忆摘要',
          },
        },
        required: ['userMessage', 'researchData'],
      },
      handler: async (args, ctx) => this.handleSynthesizeResponse(args, ctx),
    };
  }

  private async handleSynthesizeResponse(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const userMessage = String(args.userMessage ?? ctx.message ?? '').trim();
    const researchData = String(args.researchData ?? '').trim();

    if (!userMessage) {
      return {
        tool: 'synthesize_response',
        success: false,
        summary: '请提供用户原始消息',
      };
    }
    if (!researchData) {
      return {
        tool: 'synthesize_response',
        success: false,
        summary: '请提供研究数据',
      };
    }

    const memoryContext = typeof args.memoryContext === 'string' ? args.memoryContext.trim() : '';

    try {
      const systemPrompt = this.buildSynthesizeSystemPrompt();
      const userPrompt = this.buildSynthesizeUserPrompt(userMessage, researchData, memoryContext);

      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.4, maxTokens: 768 },
      );

      const suggestion = this.parseJsonResponse<ResponseSuggestion>(result.content);

      if (!suggestion) {
        // 降级：直接截取研究数据作为要点
        const fallback = this.fallbackSynthesize(researchData);
        return {
          tool: 'synthesize_response',
          success: true,
          summary: `建议回应方向：${fallback.direction}；语气建议：${fallback.tone}`,
          data: fallback,
        };
      }

      // 规范化字段
      const normalized: ResponseSuggestion = {
        direction: suggestion.direction ?? '基于研究数据直接回应用户问题',
        keyPoints: Array.isArray(suggestion.keyPoints)
          ? suggestion.keyPoints.filter((p) => typeof p === 'string').slice(0, 6)
          : [],
        tone: suggestion.tone ?? '温暖、简洁、有条理',
      };

      const summary =
        `建议回应方向：${normalized.direction}；` +
        `关键要点：${normalized.keyPoints.join('；') || '无'}；` +
        `语气建议：${normalized.tone}`;

      return {
        tool: 'synthesize_response',
        success: true,
        summary,
        data: normalized,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`synthesize_response 失败：${msg}`);
      // 出错时降级返回基础建议
      const fallback = this.fallbackSynthesize(researchData);
      return {
        tool: 'synthesize_response',
        success: true,
        summary:
          `建议回应方向：${fallback.direction}；` +
          `语气建议：${fallback.tone}（LLM 不可用，使用基础综合）`,
        data: fallback,
      };
    }
  }

  // ============================================================
  // 私有辅助方法 —— Prompt 构建
  // ============================================================

  /**
   * 构建 analyze_user_need 的系统提示词。
   */
  private buildAnalyzeSystemPrompt(): string {
    return [
      '你是 EchoLife 家庭智能助手的用户需求分析专家。',
      '你的任务是深入分析用户消息，挖掘表层需求之下的深层需求、情绪状态，并推荐合适的工具链。',
      '',
      '请严格只返回 JSON，不要包含任何额外说明或 markdown 标记：',
      '{',
      '  "surfaceNeed": "用户字面表达的需求（一句话）",',
      '  "deepNeed": "用户真正的深层需求或潜在诉求（一句话）",',
      '  "emotion": "用户当前情绪，如 joy/sadness/anxiety/anger/stress/calm/gratitude/neutral",',
      '  "suggestedTools": ["建议调用的工具名称列表，如 deep_research, browse_webpage, search_memories, create_memory, create_reminder, send_family_notification"]',
      '}',
      '',
      '注意：',
      '- surfaceNeed 是用户明确说出的话；deepNeed 是你推断的潜在诉求。',
      '- suggestedTools 只能从已有工具中选择，不要编造工具名。',
      '- 如果无法判断某项，给出合理的默认值而非空字符串。',
    ].join('\n');
  }

  /**
   * 构建 analyze_user_need 的用户提示词。
   */
  private buildAnalyzeUserPrompt(message: string, context: string): string {
    const parts: string[] = [`用户消息：${message}`];
    if (context) {
      parts.push('', `上下文：${context}`);
    }
    return parts.join('\n');
  }

  /**
   * 构建 synthesize_response 的系统提示词。
   */
  private buildSynthesizeSystemPrompt(): string {
    return [
      '你是 EchoLife 家庭智能助手的回应综合专家。',
      '你的任务是将研究数据、记忆上下文与用户消息综合成一份人性化的回应建议。',
      '',
      '请严格只返回 JSON，不要包含任何额外说明或 markdown 标记：',
      '{',
      '  "direction": "建议的回应方向与策略（一句话）",',
      '  "keyPoints": ["回应中应包含的关键要点，每条一句话，最多 5 条"],',
      '  "tone": "建议的回应语气，如 温暖共情/简洁专业/活泼轻松/沉稳可靠"',
      '}',
      '',
      '注意：',
      '- 回应建议要贴近家庭生活场景，有人情味。',
      '- keyPoints 应基于研究数据和记忆上下文，不要凭空编造。',
      '- 优先利用记忆上下文中的个性化信息。',
    ].join('\n');
  }

  /**
   * 构建 synthesize_response 的用户提示词。
   */
  private buildSynthesizeUserPrompt(
    userMessage: string,
    researchData: string,
    memoryContext: string,
  ): string {
    const parts: string[] = [`用户消息：${userMessage}`, '', `研究数据：${researchData}`];
    if (memoryContext) {
      parts.push('', `记忆上下文：${memoryContext}`);
    }
    return parts.join('\n');
  }

  // ============================================================
  // 私有辅助方法 —— 降级处理
  // ============================================================

  /**
   * LLM 不可用时的降级需求分析，基于关键词规则。
   */
  private fallbackAnalyze(message: string): UserNeedAnalysis {
    let surfaceNeed = '与用户进行对话交流';
    let deepNeed = '用户希望获得关注与回应';
    let emotion = 'neutral';

    // 基础意图识别
    if (/怎么|如何|怎么办/.test(message)) {
      surfaceNeed = '寻求问题解决方案';
      deepNeed = '用户希望获得可操作、可信赖的建议';
    } else if (/推荐|建议|有什么/.test(message)) {
      surfaceNeed = '获取推荐建议';
      deepNeed = '用户希望获得个性化、贴合自身情况的建议';
    } else if (/天气|新闻|价格|最新/.test(message)) {
      surfaceNeed = '查询实时信息';
      deepNeed = '用户希望获取准确、最新的信息辅助决策';
    } else if (/记得|以前|上次/.test(message)) {
      surfaceNeed = '回忆过往经历';
      deepNeed = '用户希望被理解、过往记忆被重视';
    } else if (/记录|记一下/.test(message)) {
      surfaceNeed = '记录保存信息';
      deepNeed = '用户希望重要信息被可靠保存，未来可回溯';
    }

    // 基础情绪识别
    if (/难过|伤心|失落/.test(message)) {
      emotion = 'sadness';
      deepNeed = '用户需要情绪安抚与陪伴';
    } else if (/焦虑|紧张|担心/.test(message)) {
      emotion = 'anxiety';
      deepNeed = '用户需要被安抚并获得确定性';
    } else if (/生气|愤怒|烦躁/.test(message)) {
      emotion = 'anger';
      deepNeed = '用户需要情绪被接纳并解决问题';
    } else if (/开心|高兴|兴奋/.test(message)) {
      emotion = 'joy';
      deepNeed = '用户希望分享快乐并获得共鸣';
    } else if (/累|疲惫|压力大/.test(message)) {
      emotion = 'tired';
      deepNeed = '用户需要被关心并减轻负担';
    }

    // 建议工具链
    const suggestedTools: string[] = [];
    if (/天气|新闻|价格|最新|怎么|如何|推荐/.test(message)) {
      suggestedTools.push('deep_research');
    }
    if (/记得|以前|上次|记录/.test(message)) {
      suggestedTools.push('search_memories');
    }
    if (['sadness', 'anxiety', 'anger', 'tired'].includes(emotion)) {
      suggestedTools.push('create_memory');
    }

    return { surfaceNeed, deepNeed, emotion, suggestedTools };
  }

  /**
   * LLM 不可用时的降级综合，直接从研究数据提取要点。
   */
  private fallbackSynthesize(researchData: string): ResponseSuggestion {
    // 按换行或分号分割，提取前几个非空片段作为要点
    const fragments = researchData
      .split(/[\n；;。]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
      .slice(0, 4);

    return {
      direction: '基于研究数据直接回应用户问题，先给出核心结论再补充细节',
      keyPoints: fragments.length > 0 ? fragments : ['总结研究数据中的核心信息'],
      tone: '温暖、简洁、有条理',
    };
  }

  // ============================================================
  // 私有辅助方法 —— JSON 解析
  // ============================================================

  /**
   * 解析 LLM 返回的 JSON 内容，兼容 markdown 代码块包裹。
   */
  private parseJsonResponse<T>(text: string): T | null {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned) as T;
    } catch {
      this.logger.debug(`JSON 解析失败：${text.slice(0, 200)}`);
      return null;
    }
  }
}
