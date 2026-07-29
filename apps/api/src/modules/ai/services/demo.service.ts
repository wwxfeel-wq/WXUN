import { Injectable, Logger } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { LlmAdapterService } from './llm-adapter.service';

export interface DemoStep {
  name: string;
  icon: string;
  success: boolean;
  latencyMs: number;
  model?: string;
  content?: string;
  dimensions?: number;
  preview?: string[];
  tokens?: { prompt?: number; completion?: number; total: number };
  error?: string;
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly llmAdapter: LlmAdapterService,
  ) {}

  /**
   * Run the full AI pipeline demo:
   * 1. AI chat (introduce EchoLife)
   * 2. Vector embedding (if provider supports it)
   * 3. AI summarization
   */
  async runDemo(): Promise<{
    success: boolean;
    provider: string;
    model: string;
    steps: DemoStep[];
    totalLatencyMs: number;
    message?: string;
  }> {
    const provider = await this.apiKeyService.getActiveProvider();
    const cfg = this.apiKeyService.getProviderConfig(provider);
    const key = await this.apiKeyService.getApiKey(provider);

    if (!key) {
      return {
        success: false,
        provider: cfg.label,
        model: cfg.chatModel,
        steps: [],
        totalLatencyMs: 0,
        message: `未配置 ${cfg.label} 的 API Key，请先在「AI 接入配置」中设置`,
      };
    }

    const steps: DemoStep[] = [];

    // === Step 1: AI Chat ===
    const t1 = Date.now();
    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: '你是 EchoLife 的 AI 助手。EchoLife 是一个 AI 数字人生操作系统，帮助用户记录记忆、管理人格档案、构建生命树。请用简洁友好的语气回答。' },
          { role: 'user', content: '你好！请用两句话介绍你能为我的数字人生做什么。' },
        ],
        { maxTokens: 200, temperature: 0.7 },
      );
      steps.push({
        name: 'AI 对话',
        icon: 'chat',
        success: true,
        latencyMs: Date.now() - t1,
        model: result.model,
        content: result.content,
        tokens: { prompt: result.promptTokens, completion: result.completionTokens, total: result.totalTokens },
      });
    } catch (e) {
      steps.push({ name: 'AI 对话', icon: 'chat', success: false, latencyMs: Date.now() - t1, error: (e as Error).message });
    }

    // === Step 2: Vector Embedding (if supported) ===
    if (cfg.supportsEmbedding && cfg.embeddingModel) {
      const t2 = Date.now();
      try {
        const embedding = await this.llmAdapter.embed(
          'EchoLife: 记录你的数字人生，让 AI 帮你管理记忆、总结和人格档案。',
        );
        steps.push({
          name: '向量化',
          icon: 'vector',
          success: true,
          latencyMs: Date.now() - t2,
          dimensions: embedding.length,
          preview: embedding.slice(0, 8).map((v) => v.toFixed(4)),
          tokens: { total: 0 },
        });
      } catch (e) {
        steps.push({ name: '向量化', icon: 'vector', success: false, latencyMs: Date.now() - t2, error: (e as Error).message });
      }
    } else {
      steps.push({
        name: '向量化',
        icon: 'vector',
        success: false,
        latencyMs: 0,
        error: `${cfg.label} 不支持向量嵌入，已跳过`,
      });
    }

    // === Step 3: AI Summarization ===
    const t3 = Date.now();
    try {
      const result = await this.llmAdapter.chatComplete(
        [
          { role: 'system', content: '你是一个文本总结助手。请将用户的输入总结为一句话。' },
          { role: 'user', content: '今天我去了公园散步，看到了很多老人在打太极，孩子们在放风筝。天气很好，阳光明媚。我还买了一杯咖啡，坐在长椅上看书，度过了一个悠闲的下午。' },
        ],
        { maxTokens: 100, temperature: 0.3 },
      );
      steps.push({
        name: 'AI 总结',
        icon: 'summary',
        success: true,
        latencyMs: Date.now() - t3,
        model: result.model,
        content: result.content,
        tokens: { prompt: result.promptTokens, completion: result.completionTokens, total: result.totalTokens },
      });
    } catch (e) {
      steps.push({ name: 'AI 总结', icon: 'summary', success: false, latencyMs: Date.now() - t3, error: (e as Error).message });
    }

    const anySuccess = steps.some((s) => s.success);
    return {
      success: anySuccess,
      provider: cfg.label,
      model: cfg.chatModel,
      steps,
      totalLatencyMs: steps.reduce((sum, s) => sum + s.latencyMs, 0),
    };
  }
}
