import { Injectable, Logger } from '@nestjs/common';
import { AgentRuntimeService } from '../../agent/services/agent-runtime.service';
import { AgentInput, SSEEvent } from '@echolife/shared';

/** Input for the digital life persona endpoint */
export interface DigitalLifeInput {
  userId: string;
  message: string;
  persona?: string;
}

/**
 * AgentOrchestratorService — public facade for AI streaming endpoints.
 *
 * Phase 3 refactor: the service now delegates to AgentRuntime, which
 * implements the real Agent pipeline (Planner, Reasoning, Memory Bridge,
 * Tool Calling, Workflow Engine, Action, Observation, Scheduler) behind
 * the unified 「时墨」 persona.
 */
@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(private readonly agentRuntime: AgentRuntimeService) {}

  /**
   * Main interview orchestration pipeline.
   *
   * Delegates to AgentRuntime.run() which performs:
   * - quota check
   * - memory retrieval
   * - planning + reasoning + structured tool calling
   * - response streaming as 时墨
   * - workflow execution, emotion/entity extraction
   * - logging and skill evolution
   *
   * @param input - The agent input containing userId, message, and optional interviewId
   * @yields {SSEEvent} SSE events (token, reasoning, tool_call, observation, action, workflow_step, entities, emotion, done, error, skill_exp, skill_level_up)
   */
  async *interview(input: AgentInput): AsyncGenerator<SSEEvent> {
    try {
      yield* this.agentRuntime.run({
        userId: input.userId,
        message: input.message,
        interviewId: input.interviewId,
        mode: 'chat',
      });
    } catch (error) {
      this.logger.error(`Interview orchestration error: ${(error as Error).message}`, (error as Error).stack);
      yield {
        type: 'error' as never,
        data: { message: 'AI服务内部错误，请稍后重试', code: 50001 },
      };
    }
  }

  /**
   * Streams a response from the user's digital life persona.
   *
   * Delegates to AgentRuntime.run() in digital-life mode. The digital life
   * speaks in the user's voice based on their memories and personality profile,
   * while still being presented through the 时墨 interface.
   *
   * @param input - The digital life input
   * @yields {SSEEvent} SSE events (token, done, error)
   */
  async *digitalLife(input: DigitalLifeInput): AsyncGenerator<SSEEvent> {
    try {
      yield* this.agentRuntime.run({
        userId: input.userId,
        message: input.message,
        mode: 'digital-life',
        persona: input.persona,
      });
    } catch (error) {
      this.logger.error(`Digital life orchestration error: ${(error as Error).message}`, (error as Error).stack);
      yield {
        type: 'error' as never,
        data: { message: '数字生命服务内部错误', code: 50001 },
      };
    }
  }
}
