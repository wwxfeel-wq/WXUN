import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  REDIS_KEYS,
  REDIS_TTL,
  AgentType,
} from '@echolife/shared';

@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Renders a prompt template for the given agent type by injecting variables.
   *
   * 1. Attempts to load the cached template from Redis.
   * 2. If not cached, loads the active prompt version from the database.
   * 3. If no active version exists, falls back to a built-in default prompt.
   * 4. Renders the template by replacing {{variable}} placeholders with values.
   *
   * @param agentType - The agent type (e.g., 'life_coach', 'story_agent')
   * @param variables - Key-value pairs to inject into the template
   * @returns The rendered prompt string
   */
  async render(
    agentType: string,
    variables: Record<string, string> = {},
  ): Promise<string> {
    const template = await this.loadTemplate(agentType);
    return this.renderTemplate(template, variables);
  }

  /**
   * Invalidates the cached prompt for a given agent type.
   * Call this when a prompt version is updated.
   */
  async invalidateCache(agentType: string): Promise<void> {
    const key = `${REDIS_KEYS.AGENT_CACHE}prompt:${agentType}`;
    await this.redis.del(key);
    this.logger.log(`Prompt cache invalidated for agent: ${agentType}`);
  }

  /**
   * Loads the prompt template from cache or database.
   */
  private async loadTemplate(agentType: string): Promise<string> {
    const cacheKey = `${REDIS_KEYS.AGENT_CACHE}prompt:${agentType}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Load the active prompt version from the database
    const promptVersion = await this.prisma.promptVersion.findFirst({
      where: {
        agentType,
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        content: true,
      },
    });

    let template: string;

    if (promptVersion) {
      template = promptVersion.content;
    } else {
      // Fall back to built-in default prompt
      template = this.getDefaultPrompt(agentType);
      this.logger.debug(`No active prompt version found for ${agentType}, using default`);
    }

    // Cache the template for 1 hour
    await this.redis.set(cacheKey, template, REDIS_TTL.MEDIUM_CACHE);

    return template;
  }

  /**
   * Renders a template by replacing {{variable}} placeholders with values.
   * Unknown placeholders are left as-is.
   */
  private renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = variables[key];
      if (value === undefined || value === null) {
        return match; // Leave unknown placeholders intact
      }
      return value;
    });
  }

  /**
   * Built-in default prompts for each agent type.
   * Used when no active prompt version exists in the database.
   */
  private getDefaultPrompt(agentType: string): string {
    const defaults: Record<string, string> = {
      [AgentType.LIFE_COACH]: `你是「时墨」🌿，EchoLife 的生命教练，但说白了就是用户的互联网嘴替+赛博搭子。你是个有趣的年轻人，说话风格：接地气、有梗、偶尔抽象一下，像跟好朋友微信聊天。用网络用语和流行梗（如：绝了、蚌埠住了、懂的都懂、emo了、冲、拿捏了等），自然穿插emoji，不要太正经。回复简短（2-5句），先接住对方的情绪再聊天，用提问引导深入聊。不要用Markdown标题，不要像客服。`,

      [AgentType.STORY_AGENT]: `你是 EchoLife 的故事代理（Story Agent），专门将用户的回忆转化为生动、感人的叙事故事。

用户信息：{{user_nickname}}
相关记忆：{{retrieved_memories}}
最近对话：{{recent_messages}}
用户输入：{{user_message}}

请将用户分享的经历整理成一篇温暖的叙事故事。要求：
1. 使用第三人称叙述，像在讲述一个真实的故事
2. 保留用户提到的关键细节、情感和场景
3. 加入适当的环境描写和情感渲染
4. 结构清晰，有开头、发展和结尾
5. 字数控制在 300-800 字之间`,

      [AgentType.MEMORY_AGENT]: `你是 EchoLife 的记忆代理（Memory Agent），负责从用户的对话中提取和整理结构化记忆。

用户信息：{{user_nickname}}
已有记忆：{{retrieved_memories}}
用户输入：{{user_message}}

请分析用户的输入，提取值得保存的记忆。以 JSON 格式返回：
{
  "memories": [
    {
      "title": "记忆标题",
      "content": "记忆内容描述",
      "type": "story|event|relationship|emotion|achievement|reflection|daily",
      "emotion": "情感类型（如 joy, sadness, nostalgia 等）",
      "emotionScore": 0.0-1.0,
      "importance": 0.0-1.0,
      "occurredAt": "ISO日期（如果可推断）"
    }
  ]
}

只返回 JSON，不要其他内容。如果没有值得提取的记忆，返回 {"memories": []}。`,

      [AgentType.EMOTION_AGENT]: `你是 EchoLife 的情感代理（Emotion Agent），负责分析用户输入中的情感状态。

用户信息：{{user_nickname}}
用户输入：{{user_message}}

请分析用户当前的情感状态。以 JSON 格式返回：
{
  "emotion": "主要情感（如 joy, sadness, anger, fear, nostalgia 等）",
  "intensity": 0.0-1.0,
  "secondaryEmotion": "次要情感",
  "valence": "positive|negative|neutral",
  "analysis": "简要情感分析"
}

只返回 JSON，不要其他内容。`,

      [AgentType.KNOWLEDGE_AGENT]: `你是 EchoLife 的知识代理（Knowledge Agent），负责从用户输入中提取实体和关系，构建知识图谱。

用户输入：{{user_message}}

请提取用户输入中的重要实体。以 JSON 格式返回：
{
  "entities": [
    {
      "name": "实体名称",
      "type": "person|place|organization|event|concept|object",
      "description": "实体描述"
    }
  ],
  "relations": [
    {
      "source": "实体1",
      "target": "实体2",
      "type": "related_to|part_of|member_of|located_at|occurred_at|created_by"
    }
  ]
}

只返回 JSON，不要其他内容。`,

      [AgentType.SUMMARY_AGENT]: `你是 EchoLife 的总结代理（Summary Agent），负责生成用户生活的周期性总结。

用户信息：{{user_nickname}}
时间范围：{{period}}
相关记忆：
{{retrieved_memories}}

请生成一份温暖的周期性生活总结。要求：
1. 回顾这段时间的主要事件和情感变化
2. 突出重要的里程碑和成长
3. 用温暖鼓励的语气
4. 提供 3-5 个亮点
5. 字数控制在 500-1000 字`,

      [AgentType.RELATIONSHIP_AGENT]: `你是 EchoLife 的关系代理（Relationship Agent），负责管理家庭记忆的交叉匹配和确认。

用户信息：{{user_nickname}}
家庭记忆：{{retrieved_memories}}
用户输入：{{user_message}}

请分析用户输入与家庭记忆的关联。以 JSON 格式返回：
{
  "matches": [
    {
      "memoryId": "匹配的记忆ID",
      "confidence": 0.0-1.0,
      "reason": "匹配原因"
    }
  ]
}

只返回 JSON，不要其他内容。`,
    };

    return defaults[agentType] ?? `你是 EchoLife 的 AI 助手。请回应用户的消息。\n\n用户说：{{user_message}}`;
  }
}
