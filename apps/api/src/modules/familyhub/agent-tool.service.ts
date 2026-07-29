import { Injectable, Logger } from '@nestjs/common';
import { RagService } from '../ai/services/rag.service';
import {
  LlmAdapterService,
  ChatMessage,
} from '../ai/services/llm-adapter.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import { CreateMemoryDto } from '../memory/dto/create-memory.dto';
import {
  WebSearchService,
  WebSearchResult,
} from '../ai/services/web-search.service';
import {
  MemoryType,
  MemoryVisibility,
  RAG_DEFAULTS,
} from '@echolife/shared';
import { McpToolRegistry } from '../agent/tool-registry/mcp-tool-registry.service';

/** Result of executing a single tool */
export interface AgentToolResult {
  tool: string;
  success: boolean;
  summary: string;
  data?: unknown;
}

/** Context passed to every tool handler */
interface ToolContext {
  userId: string;
  agentCode: string;
  message: string;
}

type ToolHandler = (ctx: ToolContext) => Promise<AgentToolResult>;

interface ToolDefinition {
  name: string;
  description: string;
  matcher: (message: string) => boolean;
  handler: ToolHandler;
}

/** Tools available to each dashboard agent */
const AGENT_TOOLS: Record<string, string[]> = {
  life: ['create_task', 'search_memories', 'get_weather', 'web_search'],
  kitchen: ['search_recipes', 'nutrition_info'],
  repair: ['search_knowledge', 'web_search'],
  knowledge: ['search_knowledge', 'upsert_entity', 'web_search'],
  health: ['track_health', 'search_health_memories', 'web_search'],
  travel: ['plan_itinerary', 'get_weather', 'web_search'],
  care: ['create_reminder', 'search_memories'],
  growth: ['track_milestone', 'search_growth_memories'],
  emotion: ['log_mood', 'search_emotion_memories', 'analyze_emotion'],
  shopping: ['create_budget_note', 'web_search'],
  pet: ['track_pet_health', 'web_search'],
  finance: ['track_expense', 'search_finance_memories', 'web_search'],
  life_coach: ['extract_memory', 'web_search'],
  story_agent: ['extract_memory', 'gather_story_memories', 'web_search'],
};

/** Health metrics that can be detected from free text */
const HEALTH_PATTERNS: Array<{
  key: string;
  regex: RegExp;
  formatter: (m: RegExpMatchArray) => string;
}> = [
  {
    key: '血压',
    regex: /血压[:：\s]*(\d{2,3})\s*[\/／]\s*(\d{2,3})/,
    formatter: (m) => `血压 ${m[1]}/${m[2]} mmHg`,
  },
  {
    key: '血糖',
    regex: /血糖[:：\s]*(\d+\.?\d*)/,
    formatter: (m) => `血糖 ${m[1]} mmol/L`,
  },
  {
    key: '体重',
    regex: /体重[:：\s]*(\d+\.?\d*)\s*(kg|公斤|斤)?/i,
    formatter: (m) => `体重 ${m[1]}${m[2] ?? 'kg'}`,
  },
  {
    key: '体温',
    regex: /体温[:：\s]*(\d+\.?\d*)\s*度?/,
    formatter: (m) => `体温 ${m[1]}°C`,
  },
  {
    key: '心率',
    regex: /心率[:：\s]*(\d+)/,
    formatter: (m) => `心率 ${m[1]} bpm`,
  },
  {
    key: '步数',
    regex: /步数[:：\s]*(\d+)/,
    formatter: (m) => `步数 ${m[1]} 步`,
  },
];

/** Emotion keywords for quick mood logging */
const EMOTION_KEYWORDS: Array<[string, string]> = [
  ['开心', 'joy'],
  ['高兴', 'joy'],
  ['难过', 'sadness'],
  ['伤心', 'sadness'],
  ['焦虑', 'anxiety'],
  ['紧张', 'anxiety'],
  ['生气', 'anger'],
  ['愤怒', 'anger'],
  ['压力大', 'stress'],
  ['疲惫', 'tired'],
  ['平静', 'calm'],
  ['感激', 'gratitude'],
  ['怀旧', 'nostalgia'],
  ['emo', 'low'],
  ['摆烂', 'low'],
];

@Injectable()
export class AgentToolService {
  private readonly logger = new Logger(AgentToolService.name);
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    private readonly ragService: RagService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly knowledgeService: KnowledgeService,
    private readonly memoryService: MemoryService,
    private readonly webSearchService: WebSearchService,
    private readonly mcpToolRegistry: McpToolRegistry,
  ) {
    this.registerTools();
  }

  /**
   * Execute a single tool by name with structured arguments.
   *
   * If the tool is registered in the MCP Tool Registry, the call is delegated
   * there so the real database-backed handlers are used. Otherwise we fall
   * back to the legacy regex-based handlers.
   */
  async executeTool(
    agentCode: string,
    userId: string,
    name: string,
    args: Record<string, unknown>,
    originalMessage?: string,
  ): Promise<AgentToolResult> {
    if (this.mcpToolRegistry.has(name)) {
      const syntheticMessage = originalMessage ?? this.buildSyntheticMessage(name, args);
      const result = await this.mcpToolRegistry.execute(name, args, {
        userId,
        agentCode,
        message: syntheticMessage,
      });
      return {
        tool: result.tool,
        success: result.success,
        summary: result.summary,
        data: result.data,
      };
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return {
        tool: name,
        success: false,
        summary: `未找到工具：${name}`,
      };
    }

    const syntheticMessage = originalMessage ?? this.buildSyntheticMessage(name, args);
    const ctx: ToolContext = { userId, agentCode, message: syntheticMessage };

    try {
      return await tool.handler(ctx);
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Structured tool ${name} failed: ${msg}`);
      return {
        tool: name,
        success: false,
        summary: `工具执行失败：${msg}`,
      };
    }
  }

  /**
   * Execute all tools that match the user message for the given agent.
   * Results are returned so they can be injected into the LLM context.
   */
  async executeTools(
    agentCode: string,
    userId: string,
    message: string,
  ): Promise<AgentToolResult[]> {
    const toolNames = AGENT_TOOLS[agentCode] ?? [];
    if (toolNames.length === 0) {
      return [];
    }

    const ctx: ToolContext = { userId, agentCode, message };
    const results: AgentToolResult[] = [];

    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (!tool) continue;
      try {
        if (tool.matcher(message)) {
          this.logger.debug(
            `Executing tool ${name} for agent ${agentCode}`,
          );
          results.push(await tool.handler(ctx));
        }
      } catch (error) {
        const msg = (error as Error).message;
        this.logger.warn(`Tool ${name} failed: ${msg}`);
        results.push({
          tool: name,
          success: false,
          summary: `工具执行失败：${msg}`,
        });
      }
    }

    return results;
  }

  /** Format tool results for injection into the LLM system prompt */
  formatToolContext(results: AgentToolResult[]): string {
    if (results.length === 0) return '';
    const lines = results
      .map((r) => `- ${r.tool}（${r.success ? '成功' : '失败'}）：${r.summary}`)
      .join('\n');
    return `\n\n【工具调用结果】\n${lines}`;
  }

  // ============================================================
  // Tool registration
  // ============================================================

  private registerTools() {
    this.tools.set('search_memories', {
      name: 'search_memories',
      description: '检索用户长期记忆中的相关内容',
      matcher: (m) =>
        /记得|回忆|以前|上次|曾经|之前|提到过|说过|想不起来/.test(m),
      handler: (ctx) => this.searchMemories(ctx),
    });

    this.tools.set('search_recipes', {
      name: 'search_recipes',
      description: '根据食材或菜名搜索菜谱记忆',
      matcher: (m) => /菜|食谱|做法|怎么做|吃什么|推荐.*吃/.test(m),
      handler: (ctx) => this.searchMemories(ctx, [MemoryType.STORY, MemoryType.DAILY], '菜谱记忆'),
    });

    this.tools.set('nutrition_info', {
      name: 'nutrition_info',
      description: '提供营养成分参考（当前为离线提示）',
      matcher: (m) => /热量|卡路里|营养|蛋白质|脂肪|碳水|减脂/.test(m),
      handler: () =>
        Promise.resolve({
          tool: 'nutrition_info',
          success: true,
          summary:
            '未接入实时营养成分数据库，可基于通用饮食知识回答。',
        }),
    });

    this.tools.set('search_knowledge', {
      name: 'search_knowledge',
      description: '搜索知识库中的实体与文档',
      matcher: (m) =>
        /查|找|搜索|是什么|为什么|怎么办|文档|资料|笔记/.test(m),
      handler: (ctx) => this.searchKnowledge(ctx),
    });

    this.tools.set('upsert_entity', {
      name: 'upsert_entity',
      description: '将关键信息保存到知识图谱',
      matcher: (m) =>
        /添加到知识库|记住这个人|记住这个地方|记住这件事/.test(m),
      handler: (ctx) => this.upsertEntity(ctx),
    });

    this.tools.set('track_health', {
      name: 'track_health',
      description: '从消息中解析健康数据并保存',
      matcher: (m) =>
        HEALTH_PATTERNS.some((p) => p.regex.test(m)) ||
        /血压|血糖|体重|体温|心率|步数/.test(m),
      handler: (ctx) => this.trackHealth(ctx),
    });

    this.tools.set('search_health_memories', {
      name: 'search_health_memories',
      description: '检索历史健康记录',
      matcher: (m) => /健康记录|血压记录|血糖记录|体重记录/.test(m),
      handler: (ctx) =>
        this.searchMemories(ctx, [MemoryType.DAILY], '历史健康记录'),
    });

    this.tools.set('plan_itinerary', {
      name: 'plan_itinerary',
      description: '检索过往旅行记忆以辅助行程规划',
      matcher: (m) => /旅行|旅游|行程|攻略|去哪儿|出去玩/.test(m),
      handler: (ctx) =>
        this.searchMemories(ctx, undefined, '过往旅行记忆'),
    });

    this.tools.set('create_reminder', {
      name: 'create_reminder',
      description: '创建提醒或待办记忆',
      matcher: (m) => /提醒|待办|任务|schedule|叫我|别忘了/.test(m),
      handler: (ctx) => this.createTaskMemory(ctx, '提醒'),
    });

    this.tools.set('create_task', {
      name: 'create_task',
      description: '创建日程或任务记忆',
      matcher: (m) => /安排|计划|待办|任务|提醒|日程/.test(m),
      handler: (ctx) => this.createTaskMemory(ctx, '任务'),
    });

    this.tools.set('track_milestone', {
      name: 'track_milestone',
      description: '记录孩子成长里程碑',
      matcher: (m) =>
        /会走了|会爬了|会说话了|考了|第一名|获奖|进步|里程碑/.test(m),
      handler: (ctx) => this.trackMilestone(ctx),
    });

    this.tools.set('search_growth_memories', {
      name: 'search_growth_memories',
      description: '检索成长相关记忆',
      matcher: (m) => /成长记录|小时候|以前会|里程碑/.test(m),
      handler: (ctx) =>
        this.searchMemories(ctx, [MemoryType.ACHIEVEMENT, MemoryType.EVENT], '成长记忆'),
    });

    this.tools.set('log_mood', {
      name: 'log_mood',
      description: '记录情绪状态',
      matcher: (m) =>
        EMOTION_KEYWORDS.some(([kw]) => m.includes(kw)) ||
        /心情|情绪|感觉|状态/.test(m),
      handler: (ctx) => this.logMood(ctx),
    });

    this.tools.set('search_emotion_memories', {
      name: 'search_emotion_memories',
      description: '检索情绪相关记忆',
      matcher: (m) => /情绪记录|心情记录|以前.*难过|以前.*开心/.test(m),
      handler: (ctx) =>
        this.searchMemories(ctx, [MemoryType.EMOTION], '情绪记忆'),
    });

    this.tools.set('create_budget_note', {
      name: 'create_budget_note',
      description: '创建购物或预算备忘',
      matcher: (m) => /预算|清单|囤货|想买|购物清单|双十一/.test(m),
      handler: (ctx) => this.createBudgetNote(ctx),
    });

    this.tools.set('track_pet_health', {
      name: 'track_pet_health',
      description: '记录宠物健康或行为异常',
      matcher: (m) =>
        /猫|狗|宠物|呕吐|拉稀|食欲|疫苗|驱虫|掉毛/.test(m),
      handler: (ctx) => this.trackPetHealth(ctx),
    });

    this.tools.set('track_expense', {
      name: 'track_expense',
      description: '解析支出并保存记账记忆',
      matcher: (m) =>
        /(\d+\.?\d*)\s*(元|块|￥|RMB|rmb)/.test(m) &&
        /花|买|支出|消费|记账|花了|买了/.test(m),
      handler: (ctx) => this.trackExpense(ctx),
    });

    this.tools.set('search_finance_memories', {
      name: 'search_finance_memories',
      description: '检索历史记账记录',
      matcher: (m) => /记账|支出记录|消费记录|账单/.test(m),
      handler: (ctx) =>
        this.searchMemories(ctx, [MemoryType.DAILY], '财务记录'),
    });

    this.tools.set('extract_memory', {
      name: 'extract_memory',
      description: '从用户描述中提取并保存记忆',
      matcher: (m) =>
        /记录|记下来|这件事|我的经历|我的故事|回忆一下|发生过/.test(m),
      handler: (ctx) => this.extractMemory(ctx),
    });

    this.tools.set('gather_story_memories', {
      name: 'gather_story_memories',
      description: '为故事创作 gathering 相关记忆',
      matcher: (m) => /故事|写成|叙事|以前的事/.test(m),
      handler: (ctx) => this.searchMemories(ctx, undefined, '故事素材'),
    });

    this.tools.set('get_weather', {
      name: 'get_weather',
      description: '查询当前或未来天气（通过网络搜索实时信息）',
      matcher: (m) => /天气|气温|温度|下雨|下雪|刮风|台风|雾霾|空气质量/.test(m),
      handler: (ctx) => this.getWeather(ctx),
    });

    this.tools.set('web_search', {
      name: 'web_search',
      description: '搜索实时网络信息（新闻、价格、攻略等）',
      matcher: (m) =>
        this.webSearchService.detectRealtimeQuery(m) !== null,
      handler: (ctx) => this.webSearch(ctx),
    });

    this.tools.set('analyze_emotion', {
      name: 'analyze_emotion',
      description: '分析用户情绪并记录情绪日记',
      matcher: (m) =>
        /心情|情绪|感觉|状态|焦虑|难过|开心|压力大|emo|烦躁/.test(m),
      handler: (ctx) => this.analyzeEmotion(ctx),
    });
  }

  // ============================================================
  // Tool handlers
  // ============================================================

  private async searchMemories(
    ctx: ToolContext,
    types?: MemoryType[],
    label = '相关记忆',
  ): Promise<AgentToolResult> {
    try {
      const result = await this.ragService.retrieve(ctx.message, {
        topK: 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
        memoryTypes: types,
      });

      if (result.memories.length === 0) {
        return {
          tool: 'search_memories',
          success: true,
          summary: `未找到${label}。`,
        };
      }

      const summary = result.memories
        .slice(0, 3)
        .map((m) => `- [${m.type}] ${m.title}: ${m.content.slice(0, 120)}`)
        .join('\n');

      return {
        tool: 'search_memories',
        success: true,
        summary: `找到 ${result.memories.length} 条${label}：\n${summary}`,
        data: result.memories,
      };
    } catch (error) {
      return {
        tool: 'search_memories',
        success: false,
        summary: `记忆检索失败：${(error as Error).message}`,
      };
    }
  }

  private async searchKnowledge(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      // First try vector memory retrieval
      const rag = await this.ragService.retrieve(ctx.message, {
        topK: 5,
        userId: ctx.userId,
        weightConfig: {
          semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
          recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
          emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
        },
      });

      // Then search named entities
      const term = ctx.message.slice(0, 30).trim();
      let entities: Array<{ name: string; type: string; description: string | null }> = [];
      if (term.length >= 2) {
        entities = await this.knowledgeService.searchEntities(ctx.userId, term);
      }

      const parts: string[] = [];
      if (rag.memories.length > 0) {
        parts.push(
          `记忆片段：\n${rag.memories
            .slice(0, 3)
            .map((m) => `- ${m.title}: ${m.content.slice(0, 120)}`)
            .join('\n')}`,
        );
      }
      if (entities.length > 0) {
        parts.push(
          `知识实体：\n${entities
            .slice(0, 3)
            .map((e) => `- ${e.name}（${e.type}）${e.description ?? ''}`)
            .join('\n')}`,
        );
      }

      return {
        tool: 'search_knowledge',
        success: true,
        summary:
          parts.length > 0
            ? parts.join('\n\n')
            : '知识库中暂无匹配内容。',
        data: { memories: rag.memories, entities },
      };
    } catch (error) {
      return {
        tool: 'search_knowledge',
        success: false,
        summary: `知识检索失败：${(error as Error).message}`,
      };
    }
  }

  private async upsertEntity(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const prompt = `从用户消息中提取一个知识实体，只返回 JSON：
{"name": "实体名称", "type": "person/place/organization/event/concept/object", "description": "简短描述"}

用户消息：${ctx.message}`;
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: ctx.message },
        ],
        { temperature: 0.2, maxTokens: 512 },
      );
      const parsed = this.parseJsonResponse<{
        name?: string;
        type?: string;
        description?: string;
      }>(result.content);

      if (!parsed?.name || !parsed?.type) {
        return {
          tool: 'upsert_entity',
          success: false,
          summary: '未能从消息中识别出有效实体。',
        };
      }

      const id = await this.knowledgeService.upsertEntity(
        ctx.userId,
        parsed.name,
        parsed.type,
        parsed.description,
        { source: ctx.agentCode },
      );

      return {
        tool: 'upsert_entity',
        success: true,
        summary: `已保存知识实体「${parsed.name}」（${parsed.type}）。`,
        data: { entityId: id },
      };
    } catch (error) {
      return {
        tool: 'upsert_entity',
        success: false,
        summary: `保存知识实体失败：${(error as Error).message}`,
      };
    }
  }

  private async trackHealth(ctx: ToolContext): Promise<AgentToolResult> {
    const records: string[] = [];
    for (const pattern of HEALTH_PATTERNS) {
      const match = ctx.message.match(pattern.regex);
      if (match) {
        records.push(pattern.formatter(match));
      }
    }

    if (records.length === 0) {
      return {
        tool: 'track_health',
        success: true,
        summary: '消息中未识别到明确健康指标。',
      };
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `健康记录：${records.join('，')}`,
        content: ctx.message,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.7,
        metadata: { agentCode: ctx.agentCode, healthRecords: records },
      } as CreateMemoryDto);

      return {
        tool: 'track_health',
        success: true,
        summary: `已记录 ${records.join('，')}。`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'track_health',
        success: false,
        summary: `保存健康记录失败：${(error as Error).message}`,
      };
    }
  }

  private async createTaskMemory(
    ctx: ToolContext,
    kind: string,
  ): Promise<AgentToolResult> {
    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `${kind}：${ctx.message.slice(0, 40)}`,
        content: ctx.message,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.6,
        metadata: { agentCode: ctx.agentCode, kind },
      } as CreateMemoryDto);

      return {
        tool: 'create_task',
        success: true,
        summary: `已为你记下一条${kind}，后续可在记忆中查看。`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_task',
        success: false,
        summary: `创建${kind}备忘失败：${(error as Error).message}`,
      };
    }
  }

  private async trackMilestone(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `成长里程碑：${ctx.message.slice(0, 40)}`,
        content: ctx.message,
        type: MemoryType.ACHIEVEMENT,
        visibility: MemoryVisibility.PRIVATE,
        emotion: 'joy',
        emotionScore: 0.8,
        importance: 0.8,
        metadata: { agentCode: ctx.agentCode },
      } as CreateMemoryDto);

      return {
        tool: 'track_milestone',
        success: true,
        summary: '成长里程碑已记录。',
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'track_milestone',
        success: false,
        summary: `记录里程碑失败：${(error as Error).message}`,
      };
    }
  }

  private async logMood(ctx: ToolContext): Promise<AgentToolResult> {
    let emotion = 'neutral';
    for (const [kw, emo] of EMOTION_KEYWORDS) {
      if (ctx.message.includes(kw)) {
        emotion = emo;
        break;
      }
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `情绪记录：${emotion}`,
        content: ctx.message,
        type: MemoryType.EMOTION,
        visibility: MemoryVisibility.PRIVATE,
        emotion,
        emotionScore: 0.6,
        importance: 0.5,
        metadata: { agentCode: ctx.agentCode },
      } as CreateMemoryDto);

      return {
        tool: 'log_mood',
        success: true,
        summary: `情绪「${emotion}」已记录。`,
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'log_mood',
        success: false,
        summary: `记录情绪失败：${(error as Error).message}`,
      };
    }
  }

  private async createBudgetNote(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `购物/预算备忘：${ctx.message.slice(0, 40)}`,
        content: ctx.message,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.5,
        metadata: { agentCode: ctx.agentCode, kind: 'budget_note' },
      } as CreateMemoryDto);

      return {
        tool: 'create_budget_note',
        success: true,
        summary: '购物/预算备忘已保存。',
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'create_budget_note',
        success: false,
        summary: `保存备忘失败：${(error as Error).message}`,
      };
    }
  }

  private async trackPetHealth(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `宠物记录：${ctx.message.slice(0, 40)}`,
        content: ctx.message,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.6,
        metadata: { agentCode: ctx.agentCode, kind: 'pet' },
      } as CreateMemoryDto);

      return {
        tool: 'track_pet_health',
        success: true,
        summary: '宠物情况已记录，建议持续观察。',
        data: { memoryId: memory.id },
      };
    } catch (error) {
      return {
        tool: 'track_pet_health',
        success: false,
        summary: `记录宠物情况失败：${(error as Error).message}`,
      };
    }
  }

  private async trackExpense(ctx: ToolContext): Promise<AgentToolResult> {
    const match = ctx.message.match(/(\d+\.?\d*)\s*(元|块|￥|RMB|rmb)/);
    const amount = match ? parseFloat(match[1]) : null;

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `支出记录${amount ? `：${amount} 元` : ''}`,
        content: ctx.message,
        type: MemoryType.DAILY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.5,
        metadata: {
          agentCode: ctx.agentCode,
          kind: 'expense',
          amount,
          currency: 'CNY',
        },
      } as CreateMemoryDto);

      return {
        tool: 'track_expense',
        success: true,
        summary: amount
          ? `已记录一笔 ${amount} 元支出。`
          : '已记录支出备忘。',
        data: { memoryId: memory.id, amount },
      };
    } catch (error) {
      return {
        tool: 'track_expense',
        success: false,
        summary: `记录支出失败：${(error as Error).message}`,
      };
    }
  }

  private async extractMemory(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            '你是记忆提取助手。从用户消息中提取值得保存的事实，只返回 JSON 数组：[{"title":"","content":"","type":"story|event|emotion|achievement|daily","emotion":"","emotionScore":0.0,"importance":0.5}]。如果没有可提取的记忆，返回 []。',
        },
        { role: 'user', content: ctx.message },
      ];

      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.2,
        maxTokens: 1024,
      });
      const parsed = this.parseJsonResponse<
        Array<{
          title?: string;
          content?: string;
          type?: string;
          emotion?: string;
          emotionScore?: number;
          importance?: number;
        }>
      >(result.content);

      if (!parsed || parsed.length === 0) {
        return {
          tool: 'extract_memory',
          success: true,
          summary: '未识别到需要保存的记忆。',
        };
      }

      const memoryIds: string[] = [];
      for (const item of parsed.slice(0, 3)) {
        if (!item.title || !item.content) continue;
        const memory = await this.memoryService.create(ctx.userId, {
          title: item.title,
          content: item.content,
          type: this.normalizeMemoryType(item.type),
          visibility: MemoryVisibility.PRIVATE,
          emotion: item.emotion ?? undefined,
          emotionScore: item.emotionScore ?? 0.5,
          importance: item.importance ?? 0.6,
          metadata: { agentCode: ctx.agentCode, extracted: true },
        } as CreateMemoryDto);
        memoryIds.push(memory.id);
      }

      return {
        tool: 'extract_memory',
        success: true,
        summary: `已提取并保存 ${memoryIds.length} 条记忆。`,
        data: { memoryIds },
      };
    } catch (error) {
      return {
        tool: 'extract_memory',
        success: false,
        summary: `提取记忆失败：${(error as Error).message}`,
      };
    }
  }

  private async getWeather(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const query = `${ctx.message.replace(/[？?！!。，,]+$/g, '').trim()} 天气`;
      const result = await this.webSearchService.search(query, 3);

      if (result.results.length === 0 && !result.summary) {
        return {
          tool: 'get_weather',
          success: true,
          summary: '未找到天气信息，请提供城市名称或更具体的问题。',
        };
      }

      return {
        tool: 'get_weather',
        success: true,
        summary: this.formatSearchSummary(result),
        data: result,
      };
    } catch (error) {
      return {
        tool: 'get_weather',
        success: false,
        summary: `天气查询失败：${(error as Error).message}`,
      };
    }
  }

  private async webSearch(ctx: ToolContext): Promise<AgentToolResult> {
    try {
      const query = this.webSearchService.detectRealtimeQuery(ctx.message) ?? ctx.message;
      const result = await this.webSearchService.search(query, 5);

      if (result.results.length === 0 && !result.summary) {
        return {
          tool: 'web_search',
          success: true,
          summary: '未找到相关实时信息。',
        };
      }

      return {
        tool: 'web_search',
        success: true,
        summary: this.formatSearchSummary(result),
        data: result,
      };
    } catch (error) {
      return {
        tool: 'web_search',
        success: false,
        summary: `网络搜索失败：${(error as Error).message}`,
      };
    }
  }

  private formatSearchSummary(result: WebSearchResult): string {
    const parts: string[] = [];
    if (result.summary) {
      parts.push(result.summary);
    }
    result.results.slice(0, 3).forEach((r) => {
      if (r.snippet) parts.push(r.snippet);
    });
    return parts.length > 0
      ? parts.join('；').slice(0, 800)
      : '未找到有效搜索结果。';
  }

  private async analyzeEmotion(ctx: ToolContext): Promise<AgentToolResult> {
    let emotion = 'neutral';
    for (const [kw, emo] of EMOTION_KEYWORDS) {
      if (ctx.message.includes(kw)) {
        emotion = emo;
        break;
      }
    }

    try {
      const memory = await this.memoryService.create(ctx.userId, {
        title: `情绪分析：${emotion}`,
        content: ctx.message,
        type: MemoryType.EMOTION,
        visibility: MemoryVisibility.PRIVATE,
        emotion,
        emotionScore: 0.6,
        importance: 0.6,
        metadata: { agentCode: ctx.agentCode, kind: 'emotion_analysis' },
      } as CreateMemoryDto);

      return {
        tool: 'analyze_emotion',
        success: true,
        summary: `已识别并记录情绪「${emotion}」。`,
        data: { memoryId: memory.id, emotion },
      };
    } catch (error) {
      return {
        tool: 'analyze_emotion',
        success: false,
        summary: `情绪分析失败：${(error as Error).message}`,
      };
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private normalizeMemoryType(type?: string): MemoryType {
    const valid = Object.values(MemoryType) as string[];
    return valid.includes(type ?? '')
      ? (type as MemoryType)
      : MemoryType.STORY;
  }

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
      return null;
    }
  }

  /**
   * Build a synthetic user message from structured tool arguments.
   * This lets existing regex-based handlers work unchanged.
   */
  private buildSyntheticMessage(name: string, args: Record<string, unknown>): string {
    const content =
      typeof args.content === 'string' ? args.content : (args.query as string) ?? (args.term as string) ?? '';

    switch (name) {
      case 'search_memories':
      case 'search_health_memories':
      case 'search_emotion_memories':
      case 'search_growth_memories':
      case 'search_recipes':
      case 'search_finance_memories':
      case 'gather_story_memories':
      case 'plan_itinerary':
        return `帮我找一下 ${content}`;
      case 'search_knowledge':
        return `查一下 ${content}`;
      case 'upsert_entity':
        return `记住这个${args.type ?? '人'}：${args.name ?? content}。${args.description ?? ''}`;
      case 'track_health':
        if (Array.isArray(args.records)) {
          return args.records.join('，');
        }
        return content;
      case 'create_task':
        return `安排 ${content}`;
      case 'create_reminder':
        return `提醒 ${content}`;
      case 'create_budget_note':
        return `购物备忘：${content}`;
      case 'track_pet_health':
        return `宠物情况：${content}`;
      case 'track_expense':
        return `支出：${content}`;
      case 'log_mood':
      case 'analyze_emotion':
        return `我心情 ${content}`;
      case 'extract_memory':
        return `记录一下 ${content}`;
      case 'track_milestone':
        return `孩子成长：${content}`;
      case 'get_weather':
        return `${content} 天气`;
      case 'web_search':
        return String(content);
      case 'nutrition_info':
        return `营养：${content}`;
      default:
        return content;
    }
  }
}
