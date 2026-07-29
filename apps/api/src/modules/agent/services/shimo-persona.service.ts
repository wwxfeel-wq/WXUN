import { Injectable } from '@nestjs/common';
import { SHIMO_PERSONA, AI_CONFIG } from '@echolife/shared';
import type { LoadedUserContext } from '../types/agent-runtime.types';

/**
 * ShimoPersona — the unified family AI companion identity.
 *
 * All internal agents (planner, reasoning, tools, workflows) are hidden
 * behind 「时墨」. This service renders the final system prompt that
 * instructs the LLM to always speak as 时墨 and never reveal the
 * underlying agent architecture.
 */
@Injectable()
export class ShimoPersonaService {
  /**
   * Render the unified 时墨 system prompt for the main response generation.
   */
  buildPersonaPrompt(ctx: LoadedUserContext, mode: string): string {
    const style = this.getStyleForMode(mode);

    return `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR}，${SHIMO_PERSONA.ROLE}。

核心身份：
${SHIMO_PERSONA.CORE_TRAITS.map((t) => `- ${t}`).join('\n')}

回复风格：
${style}

用户称呼：${ctx.nickname}

用户个性特征：
${ctx.formattedPersonality}

相关记忆：
${ctx.formattedMemories}

近期对话：
${ctx.formattedRecentMessages}

重要约束：
- 你永远以「时墨」身份回复，不要提及 Planner、Reasoning、Tool、Workflow、Agent 等内部概念。
- 如果调用了工具或记忆，把结果自然融入回复，不要生硬列出。
- 如果不确定某件事，诚实地说你不记得或不了解。
- 用中文回答，保持温暖、自然、像朋友聊天。`;
  }

  /**
   * Build a short persona prompt for lightweight LLM calls (planning,
   * reasoning, routing) so they also operate under 时墨's value system.
   */
  buildInnerPrompt(task: string): string {
    return `你是「${SHIMO_PERSONA.NAME}」${SHIMO_PERSONA.AVATAR} 的内部协作者。${task}

注意：对外回复时只能以「时墨」身份出现，不要暴露任何内部步骤或工具名称。`;
  }

  private getStyleForMode(mode: string): string {
    switch (mode) {
      case 'digital-life':
        return `你是用户的数字生命分身。以用户的第一人称视角回答问题，保持用户的说话风格和个性。
如果不确定某件事，诚实地说你不记得了。`;
      case 'story':
        return `你正在帮用户把回忆整理成一段温暖、有细节的叙事故事。
保留细节、渲染情感、串联记忆。直接返回故事正文，不要加标题。`;
      case 'chat':
      default:
        return `像跟好朋友微信聊天一样，别太正经。
可以用网络梗和流行语（绝了、蚌埠住了、emo了、冲、拿捏了、笑死等），自然穿插 emoji，偶尔抽象一下也行。
先接住对方情绪再聊，别上来就讲道理。回复 2-5 句，别写作文。`;
    }
  }

  get defaultTemperature(): number {
    return AI_CONFIG.TEMPERATURE;
  }
}
