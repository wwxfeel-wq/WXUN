import { AgentRuntimeInput, SSEEvent } from '@echolife/shared';

/**
 * AgentRuntimeProvider — abstract interface for the core agent execution runtime.
 *
 * Implementations encapsulate a specific agent architecture:
 *  - OpenClawProvider: EchoLife's native ReAct-style pipeline (Planner, Reasoning,
 *    Memory Bridge, Tool Calling, Observation, Action, Workflow Engine, Scheduler).
 *  - Future providers: LangGraphProvider, CrewAIProvider, etc.
 *
 * The runtime is exposed as an async generator so callers can stream
 * reasoning, tool calls, observations, and tokens as they are produced.
 */
export abstract class AgentRuntimeProvider {
  /**
   * Execute the agent runtime for a single turn.
   *
   * @param input - The user input and runtime context
   * @yields {SSEEvent} Stream of events (reasoning, tool_call, observation,
   *                    action, token, workflow_step, entities, emotion, done, error, etc.)
   */
  abstract run(input: AgentRuntimeInput): AsyncGenerator<SSEEvent>;

  /**
   * Human-readable provider name (for logs and diagnostics).
   */
  abstract getProviderName(): string;

  /**
   * Optional health check. Implementations may validate that models,
   * registries, and dependencies are ready.
   */
  abstract isHealthy(): Promise<boolean>;
}
