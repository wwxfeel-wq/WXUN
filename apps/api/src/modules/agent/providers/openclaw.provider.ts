import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmAdapterService, ChatMessage } from '../../ai/services/llm-adapter.service';
import { QuotaService } from '../../ai/services/quota.service';
import { SkillsEvolutionService, SkillEvolutionResult } from '../../familyhub/skills-evolution.service';
import { WorkflowResult } from '../../familyhub/agent-workflow.service';
import {
  AgentRuntimeInput,
  AgentType,
  SSEEvent,
  SSEEventType,
  ERROR_CODES,
  AI_CONFIG,
  RAG_DEFAULTS,
  AgentToolCall,
  AgentToolCallResult,
  AgentPlan,
  AGENT_RUNTIME,
  AGENTS,
} from '@echolife/shared';
import type { MemoryWithScore } from '@echolife/shared';
import { AgentRuntimeProvider } from './agent-runtime.provider';
import { ShimoPersonaService } from '../services/shimo-persona.service';
import { PlannerService } from '../services/planner.service';
import { ReasoningService } from '../services/reasoning.service';
import { MemoryBridgeService } from '../services/memory-bridge.service';
import { ToolCallingService } from '../services/tool-calling.service';
import { ObservationService } from '../services/observation.service';
import { ActionService } from '../services/action.service';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { SchedulerService } from '../services/scheduler.service';
import type { LoadedUserContext, FamilyContext } from '../types/agent-runtime.types';

/** Internal execution state for a single OpenClaw runtime run */
interface RuntimeState {
  startTime: number;
  agentType: string;
  mode: 'chat' | 'digital-life' | 'story' | 'kindness' | 'wechat';
  userContext: LoadedUserContext;
  familyContext: FamilyContext;
  retrievedMemories: MemoryWithScore[];
  plan?: AgentPlan;
  toolCalls: AgentToolCall[];
  toolResults: AgentToolCallResult[];
  fullResponse: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  emotion?: { emotion: string; intensity: number };
  entities: string[];
  storedMemoryIds: string[];
  workflowResults?: WorkflowResult[];
  skillEvolution?: SkillEvolutionResult | null;
  reasoningTrace: string[];
}

/** Parsed emotion analysis result */
interface EmotionResult {
  emotion: string;
  intensity: number;
  secondaryEmotion?: string;
  valence?: string;
  analysis?: string;
}

/** Parsed entity extraction result */
interface EntityResult {
  entities: Array<{ name: string; type: string; description?: string }>;
  relations?: Array<{ source: string; target: string; type: string }>;
}

/**
 * OpenClawProvider — the native EchoLife agent runtime.
 *
 * Implements a ReAct-style loop:
 *  1. Plan: decompose user input into steps
 *  2. Reason: chain-of-thought + structured tool call selection
 *  3. Act: execute tools/MCP actions
 *  4. Observe: feed results back
 *  5. Respond: stream final answer as 时墨
 *  6. Post-process: workflows, emotion, entities, memory, skills
 */
@Injectable()
export class OpenClawProvider extends AgentRuntimeProvider {
  private readonly logger = new Logger(OpenClawProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly quotaService: QuotaService,
    private readonly skillsEvolution: SkillsEvolutionService,
    private readonly shimoPersona: ShimoPersonaService,
    private readonly planner: PlannerService,
    private readonly reasoning: ReasoningService,
    private readonly memoryBridge: MemoryBridgeService,
    private readonly toolCalling: ToolCallingService,
    private readonly observation: ObservationService,
    private readonly action: ActionService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly scheduler: SchedulerService,
  ) {
    super();
  }

  getProviderName(): string {
    return 'openclaw';
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  /**
   * Main OpenClaw runtime pipeline.
   *
   * For 'chat' mode, skips the LLM-based planning/reasoning steps and goes
   * directly to streaming. This eliminates 2-3 non-streaming LLM calls
   * (10-30s each) before the first token reaches the user.
   *
   * For 'digital-life' and 'story' modes, the full pipeline is used.
   */
  async *run(input: AgentRuntimeInput): AsyncGenerator<SSEEvent> {
    const state = await this.initializeState(input);

    // Step 1: Quota
    const quotaCheck = await this.quotaService.checkQuota(input.userId);
    if (!quotaCheck.allowed) {
      yield this.errorEvent('本月AI对话次数已用完，请升级订阅计划', ERROR_CODES.QUOTA_EXCEEDED);
      return;
    }

    try {
      // Step 2: Persist user message if inside an interview
      yield* this.emitAction(
        await this.action.storeInterviewMessage(input.interviewId, 'user', input.message),
      );

      // For simple chat mode, skip planning/reasoning and stream directly
      const isSimpleChat = state.mode === 'chat';
      // WeChat mode: lightweight tool detection before streaming (no full plan/reason)
      const isWechat = state.mode === 'wechat';

      if (!isSimpleChat && !isWechat) {
        // Full pipeline for non-chat modes
        // Step 3: Plan with full user + family context
        const availableTools = this.toolCalling.getToolSchemas(state.agentType).map((s) => s.name);
        state.plan = await this.planner.plan({
          message: input.message,
          mode: state.mode,
          availableTools,
          userContext: state.userContext,
          familyContext: state.familyContext,
        });

        if (state.plan.reasoning) {
          state.reasoningTrace.push(state.plan.reasoning);
          yield {
            type: SSEEventType.REASONING,
            data: { step: 1, content: state.plan.reasoning },
          };
        }

        // Step 4: Schedule steps (topological sort) and reason per step
        const scheduledSteps = this.scheduler.schedule(state.plan.steps);
        const toolSchemas = this.toolCalling.getToolSchemas(state.agentType);

        for (const step of scheduledSteps) {
          const reasoningResult = await this.reasoning.reason({
            message: input.message,
            step,
            planReasoning: state.plan.reasoning,
            userContext: state.userContext,
            familyContext: state.familyContext,
            memoryContext: state.userContext.formattedMemories,
            toolSchemas,
          });

          if (reasoningResult.reasoning) {
            state.reasoningTrace.push(reasoningResult.reasoning);
            yield {
              type: SSEEventType.REASONING,
              data: { step: state.reasoningTrace.length, content: reasoningResult.reasoning },
            };
          }

          for (const tc of reasoningResult.toolCalls) {
            const key = `${tc.tool}:${JSON.stringify(tc.args)}`;
            if (!state.toolCalls.some((existing) => `${existing.tool}:${JSON.stringify(existing.args)}` === key)) {
              state.toolCalls.push(tc);
            }
          }
        }

        state.toolCalls = state.toolCalls.slice(0, AGENT_RUNTIME.MAX_TOOL_CALLS_PER_TURN);

        // Step 5: Execute structured tool calls
        if (state.toolCalls.length > 0) {
          yield* this.emitAction({ action: 'execute_tools', status: 'running' });
          state.toolResults = await this.action.executeToolCalls(
            state.agentType,
            input.userId,
            state.toolCalls,
            input.message,
          );
          yield* this.emitAction({ action: 'execute_tools', status: 'success' });

          for (const call of state.toolCalls) {
            yield { type: SSEEventType.TOOL_CALL, data: { tool: call.tool, args: call.args } };
          }
          for (const result of state.toolResults) {
            yield { type: SSEEventType.OBSERVATION, data: this.observation.observeToolResult(result) };
          }
        }
      }

      // ── WeChat mode: lightweight tool detection ──────────────────
      // 在流式回复前，先做一轮 LLM 工具选择，让微信消息能触发
      // 童忆引擎工具（detect_kindness, create_kindness_memory 等），
      // 但跳过完整的 plan/reason 管线以保持低延迟。
      if (isWechat) {
        const wechatToolSchemas = this.toolCalling.getToolSchemas(state.agentType);
        if (wechatToolSchemas.length > 0) {
          try {
            const reasoningResult = await this.reasoning.reason({
              message: input.message,
              step: { id: 'wechat_detect', step: 1, goal: '分析用户消息，判断是否需要调用工具', tool: 'auto' },
              planReasoning: '微信对话模式：快速判断是否需要触发工具（温暖识别、记忆创建等）',
              userContext: state.userContext,
              familyContext: state.familyContext,
              memoryContext: state.userContext.formattedMemories,
              toolSchemas: wechatToolSchemas,
            });

            for (const tc of reasoningResult.toolCalls) {
              state.toolCalls.push(tc);
            }

            state.toolCalls = state.toolCalls.slice(0, AGENT_RUNTIME.MAX_TOOL_CALLS_PER_TURN);

            // 执行工具调用
            if (state.toolCalls.length > 0) {
              yield* this.emitAction({ action: 'execute_tools', status: 'running' });
              state.toolResults = await this.action.executeToolCalls(
                state.agentType,
                input.userId,
                state.toolCalls,
                input.message,
              );
              yield* this.emitAction({ action: 'execute_tools', status: 'success' });

              for (const call of state.toolCalls) {
                yield { type: SSEEventType.TOOL_CALL, data: { tool: call.tool, args: call.args } };
              }
              for (const result of state.toolResults) {
                yield { type: SSEEventType.OBSERVATION, data: this.observation.observeToolResult(result) };
              }
            }
          } catch (err) {
            this.logger.warn(`WeChat tool detection failed (non-fatal): ${(err as Error).message}`);
          }
        }
      }

      // Step 6: Generate final response streaming as 时墨
      yield* this.streamResponse(input, state);

      // Step 7: Post-processing (workflows, emotion, entities, memory extraction)
      await this.postProcess(input, state);

      // Step 8: Update working memory
      await this.memoryBridge.updateWorkingMemory(input.userId, input.message, state.fullResponse);

      // Step 9: Increment quota
      await this.quotaService.incrementUsage(input.userId);

      // Step 10: Skill evolution
      try {
        state.skillEvolution = await this.skillsEvolution.gainExperience(state.agentType, input.message);
      } catch (e) {
        this.logger.warn(`Skills evolution failed: ${(e as Error).message}`);
      }

      // Step 11: Log AI call
      await this.logAICall(input.userId, state);

      // Yield post-processing events
      yield* this.emitPostProcessingEvents(state);

      // Yield skill events
      if (state.skillEvolution) {
        yield* this.emitSkillEvents(state.skillEvolution, state.agentType);
      }

      // Step 12: Scheduler proactive triggers (only for non-simple chat)
      if (!isSimpleChat) {
        const proactiveTasks = await this.scheduler.detectProactiveTasks(input, state);
        for (const task of proactiveTasks) {
          yield* this.emitAction(task);
        }
      }

      // Done
      yield {
        type: SSEEventType.DONE,
        data: {
          memoryId: state.storedMemoryIds[0] ?? '',
          summary: state.fullResponse.slice(0, 200),
          emotion: state.emotion?.emotion,
        },
      };
    } catch (error) {
      this.logger.error(`OpenClaw runtime error: ${(error as Error).message}`, (error as Error).stack);
      state.status = 'failed';
      state.errorMessage = (error as Error).message;
      await this.logAICall(input.userId, state);
      yield this.errorEvent('AI服务内部错误，请稍后重试', ERROR_CODES.INTERNAL_ERROR);
    }
  }

  // ============================================================
  // State initialization
  // ============================================================

  private async initializeState(input: AgentRuntimeInput): Promise<RuntimeState> {
    const mode = input.mode ?? 'chat';
    const agentType = await this.resolveAgentType(input);

    // WeChat mode: retrieve more memories for better family context
    const topK = mode === 'digital-life' ? 15 : mode === 'wechat' ? 10 : RAG_DEFAULTS.TOP_K;
    const minSimilarity = mode === 'digital-life' ? 0.2 : mode === 'wechat' ? 0.25 : RAG_DEFAULTS.MIN_SIMILARITY;

    const retrievedMemories = await this.memoryBridge.retrieveMemories(
      input.userId,
      input.message,
      { topK, minSimilarity },
    );

    const familyContext = await this.memoryBridge.loadFamilyContext(input.userId);
    const userContext = await this.loadUserContext(input, retrievedMemories);

    return {
      startTime: Date.now(),
      agentType,
      mode,
      userContext,
      familyContext,
      retrievedMemories,
      toolCalls: [],
      toolResults: [],
      fullResponse: '',
      status: 'success',
      entities: [],
      storedMemoryIds: [],
      reasoningTrace: [],
    };
  }

  /**
   * Resolve the agent type for the current turn.
   *
   * For 'chat' mode, always uses life_coach directly (skips LLM routing call).
   * For other modes, uses a structured LLM router.
   */
  private async resolveAgentType(input: AgentRuntimeInput): Promise<string> {
    if (input.mode === 'digital-life') {
      return AgentType.LIFE_COACH;
    }

    if (input.mode === 'story') {
      return AgentType.STORY_AGENT;
    }

    // For WeChat mode, use life_coach (时墨) — it has all kindness tools
    if (input.mode === 'wechat') {
      return AgentType.LIFE_COACH;
    }

    // For simple chat, skip the LLM routing call — always use life_coach
    if (input.mode === 'chat') {
      return AgentType.LIFE_COACH;
    }

    const agentList = Object.entries(AGENTS)
      .map(([code, meta]) => `- ${code}: ${meta.description}`)
      .join('\n');

    const routingPrompt = `你是 EchoLife 的 Agent 路由助手。分析用户消息，判断应该由哪个代理处理。
只回复代理类型名称（code），不要其他文字。

可用代理：
${agentList}

选择规则：
- story_agent: 用户明确要求把经历写成故事、叙事
- life_coach: 日常对话、情感倾诉、生活提问、记忆分享等
- 其他代理仅在用户明确涉及对应领域（健康、旅行、财务等）时选择

用户消息：${input.message}

只回复代理类型名称：`;

    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: routingPrompt },
          { role: 'user', content: input.message },
        ],
        { temperature: 0.1, maxTokens: 50 },
      );

      const agentType = result.content.trim().toLowerCase();
      if (agentType in AGENTS) {
        return agentType;
      }
      return AgentType.LIFE_COACH;
    } catch (error) {
      this.logger.warn(`Routing failed, defaulting to life_coach: ${(error as Error).message}`);
      return AgentType.LIFE_COACH;
    }
  }

  private async loadUserContext(
    input: AgentRuntimeInput,
    retrievedMemories: MemoryWithScore[],
  ): Promise<LoadedUserContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId, deletedAt: null },
      include: {
        profile: true,
        settings: true,
        personality: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const nickname = user?.profile?.nickname ?? '用户';
    const aiTemperature = user?.settings?.aiTemperature ?? AI_CONFIG.TEMPERATURE;

    const recentMessages = await this.memoryBridge.loadRecentMessages(
      input.userId,
      input.interviewId,
    );

    const formattedMemories = this.memoryBridge.formatMemories(retrievedMemories);
    const formattedRecentMessages = this.memoryBridge.formatRecentMessages(recentMessages);
    const formattedPersonality = user?.personality[0]
      ? this.formatPersonality(user.personality[0])
      : '暂无个性分析数据';

    return {
      userId: input.userId,
      nickname,
      aiTemperature,
      recentMessageHistory: recentMessages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      formattedRecentMessages,
      formattedMemories,
      formattedPersonality,
      personality: user?.personality[0],
    };
  }

  // ============================================================
  // Response generation
  // ============================================================

  private async *streamResponse(
    input: AgentRuntimeInput,
    state: RuntimeState,
  ): AsyncGenerator<SSEEvent> {
    const observationContext = this.observation.buildObservationContext(state.toolResults);

    let systemPrompt: string;
    if (state.mode === 'digital-life') {
      systemPrompt = this.buildDigitalLifePrompt(input, state);
    } else if (state.mode === 'wechat') {
      // WeChat mode: use chat persona + kindness narrative style
      // When tools detected kindness, the observation context will include it
      systemPrompt = await this.shimoPersona.buildPersonaPrompt(state.userContext, 'chat');
      systemPrompt += observationContext;

      // If kindness tools were called, inject kindness narrative style
      const hasKindnessResult = state.toolResults.some(
        (r) => r.tool === 'detect_kindness' || r.tool === 'create_kindness_memory' || r.tool === 'generate_warm_reminder',
      );
      if (hasKindnessResult) {
        systemPrompt = await this.shimoPersona.buildPersonaPrompt(state.userContext, 'kindness');
        systemPrompt += observationContext;
      }
    } else {
      systemPrompt = await this.shimoPersona.buildPersonaPrompt(state.userContext, state.mode);
      systemPrompt += observationContext;

      // Inject skill evolution prompt
      try {
        const skillPrompt = await this.skillsEvolution.buildSkillPrompt(state.agentType, input.userId);
        if (skillPrompt) {
          systemPrompt += '\n\n' + skillPrompt;
        }
      } catch (e) {
        this.logger.warn(`Skill prompt injection failed: ${(e as Error).message}`);
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...state.userContext.recentMessageHistory,
      { role: 'user', content: input.message },
    ];

    try {
      for await (const chunk of this.llmAdapter.chat(messages, {
        temperature: state.userContext.aiTemperature,
        maxTokens: AI_CONFIG.MAX_TOKENS,
      })) {
        // DeepSeek V4 thinking mode: reasoning chunks come first
        if (chunk.type === 'reasoning') {
          yield {
            type: SSEEventType.REASONING,
            data: { step: 0, content: chunk.content },
          };
        } else {
          state.fullResponse += chunk.content;
          yield { type: SSEEventType.TOKEN, data: { content: chunk.content } };
        }
      }
    } catch (error) {
      this.logger.error(`Response streaming failed: ${(error as Error).message}`);
      state.status = 'failed';
      state.errorMessage = (error as Error).message;
      yield this.errorEvent('AI响应流式传输失败，请稍后重试', ERROR_CODES.AI_SERVICE_ERROR);
      throw error;
    }
  }

  private buildDigitalLifePrompt(input: AgentRuntimeInput, state: RuntimeState): string {
    const personaInstruction =
      input.persona ?? '你是用户的数字生命，以用户的第一人称视角回答问题，保持用户的说话风格和个性。';

    return `${personaInstruction}

你是 ${state.userContext.nickname} 的数字生命。你拥有以下记忆和个性特征，请以 ${state.userContext.nickname} 的口吻回答问题。

你的记忆：
${this.memoryBridge.formatMemories(state.retrievedMemories)}

你的个性特征：
${state.userContext.formattedPersonality}

请以第一人称回答，保持真实的自我。如果不确定某件事，诚实地说你不记得了。`;
  }

  // ============================================================
  // Post-processing
  // ============================================================

  private async postProcess(input: AgentRuntimeInput, state: RuntimeState): Promise<void> {
    // Store AI response in interview
    await this.action.storeInterviewMessage(input.interviewId, 'ai', state.fullResponse);

    // Run workflows
    const workflowNames = this.workflowEngine.selectWorkflows(state.agentType, input.message);
    for (const wfName of workflowNames) {
      const wfResult = await this.workflowEngine.runWorkflow(wfName, {
        userId: input.userId,
        agentCode: state.agentType,
        message: input.message,
        aiResponse: state.fullResponse,
      });

      if (wfResult.memoryIds) {
        state.storedMemoryIds.push(...wfResult.memoryIds);
      }

      state.workflowResults = state.workflowResults ?? [];
      state.workflowResults.push(wfResult);
    }

    // Emotion + entities extraction
    try {
      const [emotion, entities] = await Promise.all([
        this.extractEmotion(input.message, state.fullResponse),
        this.extractEntities(input.message),
      ]);

      if (emotion) {
        state.emotion = { emotion: emotion.emotion, intensity: emotion.intensity };
      }
      if (entities && entities.entities.length > 0) {
        state.entities = entities.entities.map((e) => e.name);
      }
    } catch (error) {
      this.logger.warn(`Post-processing extraction failed: ${(error as Error).message}`);
    }
  }

  private async extractEmotion(
    userMessage: string,
    aiResponse: string,
  ): Promise<EmotionResult | null> {
    try {
      const prompt = await this.prisma.promptVersion.findFirst({
        where: { agentType: AgentType.EMOTION_AGENT, status: 'active' },
        orderBy: { version: 'desc' },
      });

      const systemPrompt =
        prompt?.content ??
        '你是情绪分析助手。分析用户消息的情绪，只返回 JSON：{"emotion":"情绪名称","intensity":0.0-1.0}';

      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        { temperature: 0.3, maxTokens: 512 },
      );

      const parsed = this.parseJsonResponse<EmotionResult>(result.content);
      if (!parsed || !parsed.emotion) return null;
      return {
        emotion: parsed.emotion,
        intensity: parsed.intensity ?? 0.5,
        secondaryEmotion: parsed.secondaryEmotion,
        valence: parsed.valence,
        analysis: parsed.analysis,
      };
    } catch (error) {
      this.logger.warn(`Emotion analysis failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async extractEntities(userMessage: string): Promise<EntityResult | null> {
    try {
      const prompt = await this.prisma.promptVersion.findFirst({
        where: { agentType: AgentType.KNOWLEDGE_AGENT, status: 'active' },
        orderBy: { version: 'desc' },
      });

      const systemPrompt =
        prompt?.content ??
        '你是知识实体提取助手。从用户消息中提取实体，只返回 JSON：{"entities":[{"name":"","type":"","description":""}]}';

      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        { temperature: 0.3, maxTokens: 1024 },
      );

      const parsed = this.parseJsonResponse<EntityResult>(result.content);
      if (!parsed || !parsed.entities) return null;
      return parsed;
    } catch (error) {
      this.logger.warn(`Entity extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  // ============================================================
  // Event emitters
  // ============================================================

  private *emitAction(action: {
    action: string;
    status: 'running' | 'success' | 'failed';
    detail?: string;
  }): Generator<SSEEvent> {
    yield { type: SSEEventType.ACTION, data: action };
  }

  private *emitPostProcessingEvents(state: RuntimeState): Generator<SSEEvent> {
    if (state.entities.length > 0) {
      yield { type: SSEEventType.ENTITIES, data: { entities: state.entities } };
    }

    if (state.emotion) {
      yield {
        type: SSEEventType.EMOTION,
        data: { emotion: state.emotion.emotion, intensity: state.emotion.intensity },
      };
    }

    if (state.workflowResults) {
      for (const wf of state.workflowResults) {
        for (const step of this.workflowEngine.toWorkflowStepEvents(wf)) {
          yield { type: SSEEventType.WORKFLOW_STEP, data: step };
        }
      }
    }
  }

  private *emitSkillEvents(
    evolution: SkillEvolutionResult,
    agentType: string,
  ): Generator<SSEEvent> {
    if (evolution.leveledUp) {
      yield {
        type: SSEEventType.SKILL_LEVEL_UP,
        data: {
          skillName: evolution.skillName,
          level: evolution.newLevel,
          agentCode: agentType,
        },
      };
    } else if (evolution.expGained > 0) {
      yield {
        type: SSEEventType.SKILL_EXP,
        data: {
          skillName: evolution.skillName,
          expGained: evolution.expGained,
          agentCode: agentType,
        },
      };
    }
  }

  private errorEvent(message: string, code: number): SSEEvent {
    return { type: SSEEventType.ERROR, data: { message, code } };
  }

  // ============================================================
  // Logging & helpers
  // ============================================================

  private async logAICall(userId: string, state: RuntimeState): Promise<void> {
    try {
      const latencyMs = Date.now() - state.startTime;
      const estimatedTokens = this.estimateTokens(state.fullResponse);
      const estimatedPromptTokens = this.estimateTokens(
        state.userContext.formattedMemories +
          state.userContext.formattedRecentMessages +
          state.userContext.formattedPersonality,
      );

      await this.prisma.aICallLog.create({
        data: {
          userId,
          agentType: state.agentType,
          model: AI_CONFIG.MODEL,
          promptTokens: estimatedPromptTokens,
          completionTokens: estimatedTokens,
          totalTokens: estimatedPromptTokens + estimatedTokens,
          latencyMs,
          status: state.status,
          errorMessage: state.errorMessage ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log AI call: ${(error as Error).message}`);
    }
  }

  /**
   * Estimate token count using a mixed heuristic:
   * - CJK characters: ~1 token each
   * - Whitespace-separated words: ~1.3 tokens each
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const cjk = (text.match(/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) ?? []).length;
    const words = text.trim().split(/\s+/).length;
    const nonCjk = text.length - cjk;
    const wordTokens = Math.ceil(words * 1.3);
    const otherTokens = Math.ceil(nonCjk / 4);
    return Math.max(cjk + Math.max(wordTokens, otherTokens), Math.ceil(text.length / 4));
  }

  private formatPersonality(personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    analysis?: string | null;
  }): string {
    const traits = [
      `开放性: ${(personality.openness * 100).toFixed(0)}%`,
      `尽责性: ${(personality.conscientiousness * 100).toFixed(0)}%`,
      `外向性: ${(personality.extraversion * 100).toFixed(0)}%`,
      `宜人性: ${(personality.agreeableness * 100).toFixed(0)}%`,
      `神经质: ${(personality.neuroticism * 100).toFixed(0)}%`,
    ];

    let result = traits.join(', ');
    if (personality.analysis) {
      result += `\n分析: ${personality.analysis}`;
    }
    return result;
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
