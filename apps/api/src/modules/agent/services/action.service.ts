import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SSEActionData, AgentToolCall, AgentToolCallResult } from '@echolife/shared';
import { ToolCallingService } from './tool-calling.service';

/**
 * Action — executes side effects decided by the agent runtime.
 *
 * Responsibilities:
 *  - Persist user/AI exchange messages (interview context)
 *  - Execute structured tool calls via the ToolCallingService/MCP registry
 *  - Update derived state (memory counters, etc.)
 */
@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolCalling: ToolCallingService,
  ) {}

  /**
   * Store a message in the InterviewMessage table (if interviewId is set).
   */
  async storeInterviewMessage(
    interviewId: string | undefined,
    sender: string,
    content: string,
  ): Promise<SSEActionData> {
    if (!interviewId) {
      return { action: 'store_interview_message', status: 'success' };
    }

    try {
      await this.prisma.interviewMessage.create({
        data: { interviewId, sender, content },
      });
      return {
        action: 'store_interview_message',
        status: 'success',
        detail: `${sender === 'user' ? '用户' : 'AI'}消息已保存`,
      };
    } catch (error) {
      this.logger.warn(`Failed to store interview message: ${(error as Error).message}`);
      return {
        action: 'store_interview_message',
        status: 'failed',
        detail: (error as Error).message,
      };
    }
  }

  /**
   * Execute a batch of structured tool calls.
   *
   * This is the Act step of the ReAct loop. Tool selection is performed by the
   * LLM via ReasoningService; ActionService is only responsible for execution.
   */
  async executeToolCalls(
    agentCode: string,
    userId: string,
    calls: AgentToolCall[],
    originalMessage?: string,
  ): Promise<AgentToolCallResult[]> {
    if (calls.length === 0) return [];

    try {
      return await this.toolCalling.executeToolCalls(agentCode, userId, calls, originalMessage);
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Batch tool execution failed: ${msg}`);
      return calls.map((call) => ({
        tool: call.tool,
        args: call.args,
        success: false,
        summary: `批量工具执行失败：${msg}`,
      }));
    }
  }

  /**
   * Increment interview memory count.
   */
  async incrementInterviewMemoryCount(
    interviewId: string | undefined,
    count: number,
  ): Promise<SSEActionData> {
    if (!interviewId || count <= 0) {
      return { action: 'increment_memory_count', status: 'success' };
    }

    try {
      await this.prisma.interview.update({
        where: { id: interviewId },
        data: { memoryCount: { increment: count } },
      });
      return {
        action: 'increment_memory_count',
        status: 'success',
        detail: `记忆计数 +${count}`,
      };
    } catch (error) {
      this.logger.warn(`Failed to increment memory count: ${(error as Error).message}`);
      return {
        action: 'increment_memory_count',
        status: 'failed',
        detail: (error as Error).message,
      };
    }
  }
}
