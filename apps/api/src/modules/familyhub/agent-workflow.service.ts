import { Injectable, Logger } from '@nestjs/common';
import { RagService } from '../ai/services/rag.service';
import {
  LlmAdapterService,
  ChatMessage,
} from '../ai/services/llm-adapter.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { MemoryService } from '../memory/memory.service';
import { CreateMemoryDto } from '../memory/dto/create-memory.dto';
import {
  MemoryType,
  MemoryVisibility,
  RAG_DEFAULTS,
} from '@echolife/shared';

/** Status of a single workflow step */
export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
}

/** Result returned by a workflow run */
export interface WorkflowResult {
  workflow: string;
  steps: WorkflowStep[];
  memoryIds?: string[];
  output?: string;
}

/** Structured memory extracted by the LLM */
interface ExtractedMemory {
  title?: string;
  content?: string;
  type?: string;
  emotion?: string;
  emotionScore?: number;
  importance?: number;
  occurredAt?: string;
}

@Injectable()
export class AgentWorkflowService {
  private readonly logger = new Logger(AgentWorkflowService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly embeddingService: EmbeddingService,
    private readonly memoryService: MemoryService,
  ) {}

  // ============================================================
  // Memory extraction workflow
  // ============================================================

  /**
   * Parse a conversation → extract key facts → save to memory.
   */
  async runMemoryExtractionWorkflow(
    userId: string,
    agentCode: string,
    userMessage: string,
    aiResponse: string,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [
      { name: 'parse_conversation', status: 'running' },
      { name: 'extract_facts', status: 'pending' },
      { name: 'save_memories', status: 'pending' },
    ];

    try {
      const prompt =
        '你是记忆提取助手。从以下对话中提取 1-3 条值得长期保存的事实，只返回 JSON 数组：' +
        '[{"title":"","content":"","type":"story|event|emotion|achievement|daily","emotion":"","emotionScore":0.0,"importance":0.5}]。' +
        '如果没有任何可保存的事实，返回 []。';
      const messages: ChatMessage[] = [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `用户：${userMessage}\nAI：${aiResponse}`,
        },
      ];

      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.2,
        maxTokens: 1024,
      });

      steps[0] = { name: 'parse_conversation', status: 'success' };
      steps[1] = { name: 'extract_facts', status: 'running' };

      const parsed = this.parseJsonResponse<ExtractedMemory[]>(
        result.content,
      );
      const memories = (parsed ?? []).filter(
        (m): m is Required<Pick<ExtractedMemory, 'title' | 'content'>> &
          ExtractedMemory => Boolean(m.title && m.content),
      );

      steps[1] = {
        name: 'extract_facts',
        status: memories.length > 0 ? 'success' : 'success',
        detail: `提取到 ${memories.length} 条事实`,
      };
      steps[2] = { name: 'save_memories', status: 'running' };

      const memoryIds = await this.saveMemories(
        userId,
        agentCode,
        memories,
      );

      steps[2] = {
        name: 'save_memories',
        status: memoryIds.length > 0 ? 'success' : 'success',
        detail: `保存了 ${memoryIds.length} 条记忆`,
      };

      return {
        workflow: 'memory_extraction',
        steps,
        memoryIds,
        output: `已自动提取并保存 ${memoryIds.length} 条记忆`,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Memory extraction workflow failed: ${msg}`);
      for (const step of steps) {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'failed';
          step.detail = msg;
        }
      }
      return {
        workflow: 'memory_extraction',
        steps,
        output: `记忆提取工作流失败：${msg}`,
      };
    }
  }

  // ============================================================
  // Story generation workflow
  // ============================================================

  /**
   * Gather memories → generate narrative → save as a story memory.
   */
  async runStoryGenerationWorkflow(
    userId: string,
    prompt: string,
    agentCode: string,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [
      { name: 'gather_memories', status: 'running' },
      { name: 'generate_narrative', status: 'pending' },
      { name: 'save_story', status: 'pending' },
    ];

    try {
      const rag = await this.ragService.retrieve(prompt, {
        topK: 8,
        userId,
        weightConfig: {
          semantic: 0.6,
          recency: 0.3,
          emotion: 0.1,
        },
      });

      steps[0] = {
        name: 'gather_memories',
        status: 'success',
        detail: `找到 ${rag.memories.length} 条素材`,
      };
      steps[1] = { name: 'generate_narrative', status: 'running' };

      const memoryText = rag.memories
        .slice(0, 5)
        .map((m) => `- ${m.title}: ${m.content}`)
        .join('\n');

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            '你是 EchoLife 故事代理。根据以下记忆素材，将用户的请求改写成一段温暖、有细节的叙事故事。直接返回故事正文，不要加标题。',
        },
        {
          role: 'user',
          content: `用户请求：${prompt}\n\n相关记忆素材：\n${memoryText || '暂无素材'}`,
        },
      ];

      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.7,
        maxTokens: 2048,
      });

      steps[1] = {
        name: 'generate_narrative',
        status: 'success',
        detail: `生成 ${result.content.length} 字故事`,
      };
      steps[2] = { name: 'save_story', status: 'running' };

      const memory = await this.memoryService.create(userId, {
        title: `故事：${prompt.slice(0, 40)}`,
        content: result.content,
        type: MemoryType.STORY,
        visibility: MemoryVisibility.PRIVATE,
        importance: 0.8,
        metadata: { agentCode, workflow: 'story_generation' },
      } as CreateMemoryDto);

      await this.storeEmbedding(memory.id, `${memory.title} ${memory.content}`);

      steps[2] = {
        name: 'save_story',
        status: 'success',
        detail: `故事已保存为记忆 ${memory.id}`,
      };

      return {
        workflow: 'story_generation',
        steps,
        memoryIds: [memory.id],
        output: result.content.slice(0, 200),
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Story generation workflow failed: ${msg}`);
      for (const step of steps) {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'failed';
          step.detail = msg;
        }
      }
      return {
        workflow: 'story_generation',
        steps,
        output: `故事生成工作流失败：${msg}`,
      };
    }
  }

  // ============================================================
  // Emotion analysis workflow
  // ============================================================

  /**
   * Analyze user emotion → save emotion memory → generate coping advice.
   */
  async runEmotionAnalysisWorkflow(
    userId: string,
    message: string,
    aiResponse: string,
    agentCode: string,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [
      { name: 'detect_emotion', status: 'running' },
      { name: 'save_emotion_memory', status: 'pending' },
      { name: 'generate_coping_advice', status: 'pending' },
    ];

    try {
      const prompt =
        '你是情绪分析助手。从用户消息中识别主要情绪，只返回 JSON：' +
        '{"emotion":"情绪名称","intensity":1-10,"score":0.0-1.0}。';
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: message },
        ],
        { temperature: 0.2, maxTokens: 256 },
      );

      const parsed = this.parseJsonResponse<{
        emotion?: string;
        intensity?: number;
        score?: number;
      }>(result.content);

      const emotion = parsed?.emotion ?? 'neutral';
      const intensity = parsed?.intensity ?? 5;
      const score = parsed?.score ?? intensity / 10;

      steps[0] = {
        name: 'detect_emotion',
        status: 'success',
        detail: `识别情绪：${emotion}（强度 ${intensity}/10）`,
      };
      steps[1] = { name: 'save_emotion_memory', status: 'running' };

      const memory = await this.memoryService.create(userId, {
        title: `情绪分析：${emotion}`,
        content: message,
        type: MemoryType.EMOTION,
        visibility: MemoryVisibility.PRIVATE,
        emotion,
        emotionScore: score,
        importance: 0.6,
        metadata: { agentCode, workflow: 'emotion_analysis', intensity },
      } as CreateMemoryDto);

      steps[1] = {
        name: 'save_emotion_memory',
        status: 'success',
        detail: `已保存情绪记忆 ${memory.id}`,
      };
      steps[2] = { name: 'generate_coping_advice', status: 'running' };

      const advice = await this.generateEmotionAdvice(message, emotion, aiResponse);

      steps[2] = {
        name: 'generate_coping_advice',
        status: 'success',
        detail: '已生成疏导建议',
      };

      return {
        workflow: 'emotion_analysis',
        steps,
        memoryIds: [memory.id],
        output: advice,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Emotion analysis workflow failed: ${msg}`);
      for (const step of steps) {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'failed';
          step.detail = msg;
        }
      }
      return {
        workflow: 'emotion_analysis',
        steps,
        output: `情绪分析工作流失败：${msg}`,
      };
    }
  }

  private async generateEmotionAdvice(
    message: string,
    emotion: string,
    aiResponse: string,
  ): Promise<string> {
    try {
      const prompt =
        '你是心理咨询师（非医疗）。根据用户消息、识别到的情绪以及已有回复，' +
        '生成一段简短、温暖、可操作的自我调节建议（2-4 句）。';
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: `用户消息：${message}\n情绪：${emotion}\n已有回复：${aiResponse}\n请补充建议：`,
          },
        ],
        { temperature: 0.6, maxTokens: 512 },
      );
      return result.content;
    } catch (error) {
      return '照顾好自己的情绪，必要时可以寻求专业心理咨询。';
    }
  }

  // ============================================================
  // Generic workflow dispatcher (used by the Phase 3 AgentRuntime)
  // ============================================================

  /**
   * Run a workflow by name with a structured input payload.
   */
  async runWorkflow(
    name: string,
    input: {
      userId: string;
      agentCode: string;
      message: string;
      aiResponse?: string;
    },
  ): Promise<WorkflowResult> {
    switch (name) {
      case 'memory_extraction':
        return this.runMemoryExtractionWorkflow(
          input.userId,
          input.agentCode,
          input.message,
          input.aiResponse ?? '',
        );
      case 'story_generation':
        return this.runStoryGenerationWorkflow(
          input.userId,
          input.message,
          input.agentCode,
        );
      case 'emotion_analysis':
        return this.runEmotionAnalysisWorkflow(
          input.userId,
          input.message,
          input.aiResponse ?? '',
          input.agentCode,
        );
      case 'health_check':
        return this.runHealthCheckWorkflow(
          input.userId,
          input.message,
          input.aiResponse ?? '',
        );
      default:
        return {
          workflow: name,
          steps: [{ name: 'resolve', status: 'failed', detail: 'Unknown workflow' }],
          output: `未知工作流：${name}`,
        };
    }
  }

  // ============================================================
  // Health check workflow
  // ============================================================

  /**
   * Parse health data → store record → provide advice.
   */
  async runHealthCheckWorkflow(
    userId: string,
    message: string,
    aiResponse: string,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [
      { name: 'parse_health_data', status: 'running' },
      { name: 'store_record', status: 'pending' },
      { name: 'provide_advice', status: 'pending' },
    ];

    try {
      const healthInfo = this.parseHealthData(message);

      steps[0] = {
        name: 'parse_health_data',
        status: healthInfo ? 'success' : 'success',
        detail: healthInfo ?? '未识别到结构化指标',
      };
      steps[1] = { name: 'store_record', status: 'running' };

      let memoryId: string | undefined;
      if (healthInfo) {
        const memory = await this.memoryService.create(userId, {
          title: `健康检查：${healthInfo}`,
          content: message,
          type: MemoryType.DAILY,
          visibility: MemoryVisibility.PRIVATE,
          importance: 0.7,
          metadata: { agentCode: 'health', workflow: 'health_check' },
        } as CreateMemoryDto);
        memoryId = memory.id;
      }

      steps[1] = {
        name: 'store_record',
        status: memoryId ? 'success' : 'success',
        detail: memoryId ? `已保存记录 ${memoryId}` : '无记录可保存',
      };
      steps[2] = { name: 'provide_advice', status: 'running' };

      const advice = await this.generateHealthAdvice(message, aiResponse);

      steps[2] = {
        name: 'provide_advice',
        status: 'success',
        detail: '已生成健康建议',
      };

      return {
        workflow: 'health_check',
        steps,
        memoryIds: memoryId ? [memoryId] : undefined,
        output: advice,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Health check workflow failed: ${msg}`);
      for (const step of steps) {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'failed';
          step.detail = msg;
        }
      }
      return {
        workflow: 'health_check',
        steps,
        output: `健康检查工作流失败：${msg}`,
      };
    }
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async saveMemories(
    userId: string,
    agentCode: string,
    memories: ExtractedMemory[],
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const mem of memories.slice(0, 3)) {
      try {
        const type = this.normalizeMemoryType(mem.type);
        const memory = await this.memoryService.create(userId, {
          title: mem.title!,
          content: mem.content!,
          type,
          visibility: MemoryVisibility.PRIVATE,
          emotion: mem.emotion ?? undefined,
          emotionScore: mem.emotionScore ?? 0.5,
          importance: mem.importance ?? 0.6,
          occurredAt: mem.occurredAt ? new Date(mem.occurredAt) : undefined,
          metadata: { agentCode, workflow: 'memory_extraction' },
        } as CreateMemoryDto);

        ids.push(memory.id);
        await this.storeEmbedding(
          memory.id,
          `${memory.title} ${memory.content}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to save extracted memory: ${(error as Error).message}`,
        );
      }
    }

    return ids;
  }

  private async storeEmbedding(memoryId: string, text: string): Promise<void> {
    try {
      const embedding = await this.embeddingService.generateEmbedding(text);
      await this.embeddingService.storeEmbedding(memoryId, embedding);
    } catch (error) {
      this.logger.warn(
        `Failed to store embedding for memory ${memoryId}: ${(error as Error).message}`,
      );
    }
  }

  private parseHealthData(message: string): string | null {
    const records: string[] = [];
    const patterns = [
      { key: '血压', regex: /血压[:：\s]*(\d{2,3})\s*[\/／]\s*(\d{2,3})/ },
      { key: '血糖', regex: /血糖[:：\s]*(\d+\.?\d*)/ },
      { key: '体重', regex: /体重[:：\s]*(\d+\.?\d*)\s*(kg|公斤|斤)?/i },
      { key: '体温', regex: /体温[:：\s]*(\d+\.?\d*)\s*度?/ },
      { key: '心率', regex: /心率[:：\s]*(\d+)/ },
      { key: '步数', regex: /步数[:：\s]*(\d+)/ },
    ];

    for (const p of patterns) {
      const match = message.match(p.regex);
      if (match) {
        if (p.key === '血压') {
          records.push(`血压 ${match[1]}/${match[2]} mmHg`);
        } else if (p.key === '体重') {
          records.push(`体重 ${match[1]}${match[2] ?? 'kg'}`);
        } else if (p.key === '血糖') {
          records.push(`血糖 ${match[1]} mmol/L`);
        } else if (p.key === '体温') {
          records.push(`体温 ${match[1]}°C`);
        } else if (p.key === '心率') {
          records.push(`心率 ${match[1]} bpm`);
        } else if (p.key === '步数') {
          records.push(`步数 ${match[1]} 步`);
        }
      }
    }

    return records.length > 0 ? records.join('，') : null;
  }

  private async generateHealthAdvice(
    message: string,
    aiResponse: string,
  ): Promise<string> {
    try {
      const prompt = `你是一位家庭健康顾问（非医生）。请根据用户消息和已有的回复，生成一段简短、可操作的健康建议（2-4 句）。如果用户已提到就医或严重症状，请强调及时就医。`;
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: `用户消息：${message}\n已有回复：${aiResponse}\n请补充健康建议：`,
          },
        ],
        { temperature: 0.5, maxTokens: 512 },
      );
      return result.content;
    } catch (error) {
      return '保持健康的生活习惯，如有不适请及时咨询专业医生。';
    }
  }

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
}
