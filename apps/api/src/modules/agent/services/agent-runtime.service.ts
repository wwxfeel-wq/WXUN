import { Injectable, Logger } from '@nestjs/common';
import { AgentRuntimeInput, SSEEvent } from '@echolife/shared';
import { AgentRuntimeProvider } from '../providers/agent-runtime.provider';

/**
 * AgentRuntimeService — public facade for the agent runtime.
 *
 * Phase 3 refactor: the concrete runtime logic has been moved into
 * {@link AgentRuntimeProvider} implementations. This service simply
 * delegates to the injected provider so callers (e.g. AgentOrchestratorService)
 * keep the same API while the underlying engine can be swapped
 * (OpenClaw, LangGraph, CrewAI, etc.).
 */
@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(private readonly runtimeProvider: AgentRuntimeProvider) {}

  /**
   * Run the agent runtime for a single turn.
   *
   * Delegates to the configured {@link AgentRuntimeProvider}.
   */
  async *run(input: AgentRuntimeInput): AsyncGenerator<SSEEvent> {
    try {
      yield* this.runtimeProvider.run(input);
    } catch (error) {
      this.logger.error(
        `AgentRuntimeProvider ${this.runtimeProvider.getProviderName()} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Return the name of the currently configured runtime provider.
   */
  getProviderName(): string {
    return this.runtimeProvider.getProviderName();
  }
}
