import { Injectable, Logger } from '@nestjs/common';
import { AgentToolService } from '../../familyhub/agent-tool.service';
import { McpToolRegistry } from '../tool-registry/mcp-tool-registry.service';
import {
  AgentToolCall,
  AgentToolCallResult,
} from '@echolife/shared';
import type { ToolSchema } from '../types/agent-runtime.types';

/**
 * ToolCalling — exposes tools to the LLM as JSON schemas and executes
 * structured invocations decided by the LLM.
 *
 * Selection is purely schema-driven: ReasoningService presents the schemas
 * to the LLM and receives structured tool_calls back. This service does NOT
 * use regex matching to decide which tools to run.
 *
 * Execution order:
 *  1. MCP Tool Registry (schema-first, real database handlers)
 *  2. Legacy AgentToolService fallback for tools not yet migrated to MCP
 */
@Injectable()
export class ToolCallingService {
  private readonly logger = new Logger(ToolCallingService.name);

  constructor(
    private readonly agentToolService: AgentToolService,
    private readonly mcpToolRegistry: McpToolRegistry,
  ) {}

  /**
   * Return JSON schemas for all tools available to an agent.
   *
   * MCP-registered tools contribute their real schemas; legacy tools keep
   * their generated fallback schemas so the LLM can still call them.
   */
  getToolSchemas(agentCode: string): ToolSchema[] {
    const tools = this.getToolNamesForAgent(agentCode);
    return tools.map((name) => this.buildSchema(name));
  }

  /**
   * Execute a single structured tool call.
   */
  async executeToolCall(
    agentCode: string,
    userId: string,
    call: AgentToolCall,
    originalMessage?: string,
  ): Promise<AgentToolCallResult> {
    try {
      const result = await this.agentToolService.executeTool(
        agentCode,
        userId,
        call.tool,
        call.args,
        originalMessage,
      );
      return {
        tool: call.tool,
        args: call.args,
        success: result.success,
        summary: result.summary,
        data: result.data,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Structured tool call ${call.tool} failed: ${msg}`);
      return {
        tool: call.tool,
        args: call.args,
        success: false,
        summary: `工具执行失败：${msg}`,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel.
   */
  async executeToolCalls(
    agentCode: string,
    userId: string,
    calls: AgentToolCall[],
    originalMessage?: string,
  ): Promise<AgentToolCallResult[]> {
    return Promise.all(
      calls.map((call) => this.executeToolCall(agentCode, userId, call, originalMessage)),
    );
  }

  /**
   * Map agent codes to the tool names they can use.
   *
   * The list includes the new MCP tools alongside the original legacy tools.
   */
  private getToolNamesForAgent(agentCode: string): string[] {
    const toolMap: Record<string, string[]> = {
      life: ['create_memory', 'create_reminder', 'search_memories', 'create_task', 'get_weather', 'web_search'],
      kitchen: ['create_memory', 'search_memories', 'search_knowledge', 'send_family_notification', 'search_recipes', 'nutrition_info', 'web_search'],
      repair: ['create_memory', 'search_memories', 'send_family_notification', 'search_knowledge', 'web_search'],
      knowledge: ['search_knowledge', 'upsert_entity', 'create_memory', 'search_memories', 'web_search'],
      health: ['create_memory', 'create_reminder', 'search_memories', 'track_health', 'search_health_memories', 'send_family_notification', 'web_search'],
      travel: ['create_memory', 'search_memories', 'send_family_notification', 'plan_itinerary', 'get_weather', 'web_search'],
      care: ['create_memory', 'create_reminder', 'send_family_notification', 'search_memories'],
      growth: ['create_memory', 'track_milestone', 'search_memories', 'search_growth_memories'],
      emotion: ['create_memory', 'search_memories', 'send_family_notification', 'log_mood', 'search_emotion_memories', 'analyze_emotion'],
      shopping: ['create_memory', 'search_memories', 'create_budget_note', 'web_search'],
      pet: ['create_memory', 'search_memories', 'track_pet_health', 'web_search'],
      finance: ['create_memory', 'search_memories', 'track_expense', 'search_finance_memories', 'web_search'],
      life_coach: ['create_memory', 'create_reminder', 'search_memories', 'send_family_notification', 'extract_memory', 'web_search'],
      story_agent: ['create_memory', 'search_memories', 'send_family_notification', 'extract_memory', 'gather_story_memories', 'web_search'],
    };
    return toolMap[agentCode] ?? [];
  }

  private buildSchema(name: string): ToolSchema {
    const registrySchema = this.mcpToolRegistry.getSchema(name);
    if (registrySchema) {
      return {
        name: registrySchema.name,
        description: registrySchema.description,
        parameters: {
          type: 'object',
          properties: registrySchema.parameters.properties as ToolSchema['parameters']['properties'],
          required: registrySchema.parameters.required ?? [],
        },
      };
    }

    const base = {
      name,
      description: this.getToolDescription(name),
      parameters: {
        type: 'object' as const,
        properties: {} as Record<string, { type: string; description: string }>,
        required: [] as string[],
      },
    };

    switch (name) {
      case 'search_memories':
      case 'search_health_memories':
      case 'search_emotion_memories':
      case 'search_growth_memories':
      case 'search_recipes':
      case 'plan_itinerary':
      case 'gather_story_memories':
      case 'search_finance_memories':
        base.parameters.properties = {
          query: { type: 'string', description: '搜索关键词或用户原话' },
        };
        base.parameters.required = ['query'];
        break;
      case 'search_knowledge':
        base.parameters.properties = {
          term: { type: 'string', description: '要搜索的关键词' },
        };
        base.parameters.required = ['term'];
        break;
      case 'upsert_entity':
        base.parameters.properties = {
          name: { type: 'string', description: '实体名称' },
          type: { type: 'string', description: '实体类型，如 person/place/organization/event/concept/object' },
          description: { type: 'string', description: '实体简短描述' },
        };
        base.parameters.required = ['name', 'type'];
        break;
      case 'track_health':
        base.parameters.properties = {
          records: {
            type: 'array',
            description: '健康指标记录列表',
          },
        };
        base.parameters.required = ['records'];
        break;
      case 'create_task':
      case 'create_reminder':
      case 'create_budget_note':
      case 'track_pet_health':
      case 'track_expense':
      case 'log_mood':
      case 'analyze_emotion':
      case 'extract_memory':
      case 'track_milestone':
        base.parameters.properties = {
          content: { type: 'string', description: '需要记录的原始内容' },
        };
        base.parameters.required = ['content'];
        break;
      case 'get_weather':
        base.parameters.properties = {
          city: { type: 'string', description: '城市名称' },
        };
        base.parameters.required = ['city'];
        break;
      case 'web_search':
        base.parameters.properties = {
          query: { type: 'string', description: '搜索查询' },
        };
        base.parameters.required = ['query'];
        break;
      case 'nutrition_info':
      default:
        base.parameters.properties = {
          query: { type: 'string', description: '查询内容' },
        };
        break;
    }

    return base;
  }

  private getToolDescription(name: string): string {
    const descriptions: Record<string, string> = {
      search_memories: '检索用户长期记忆中的相关内容',
      search_recipes: '根据食材或菜名搜索菜谱记忆',
      nutrition_info: '提供营养成分参考（当前为离线提示）',
      search_knowledge: '搜索知识库中的实体与文档',
      upsert_entity: '将关键信息保存到知识图谱',
      track_health: '从消息中解析健康数据并保存',
      search_health_memories: '检索历史健康记录',
      plan_itinerary: '检索过往旅行记忆以辅助行程规划',
      create_reminder: '创建提醒或待办记忆',
      create_task: '创建日程或任务记忆',
      track_milestone: '记录孩子成长里程碑',
      search_growth_memories: '检索成长相关记忆',
      log_mood: '记录情绪状态',
      search_emotion_memories: '检索情绪相关记忆',
      create_budget_note: '创建购物或预算备忘',
      track_pet_health: '记录宠物健康或行为异常',
      track_expense: '解析支出并保存记账记忆',
      search_finance_memories: '检索历史记账记录',
      extract_memory: '从用户描述中提取并保存记忆',
      gather_story_memories: '为故事创作 gathering 相关记忆',
      get_weather: '查询当前或未来天气（通过网络搜索实时信息）',
      web_search: '搜索实时网络信息（新闻、价格、攻略等）',
      analyze_emotion: '分析用户情绪并记录情绪日记',
      create_memory: '将一段值得保存的家庭记忆写入长期记忆库',
      send_family_notification: '给家庭成员发送一条应用内通知',
    };
    return descriptions[name] ?? `执行 ${name}`;
  }
}
