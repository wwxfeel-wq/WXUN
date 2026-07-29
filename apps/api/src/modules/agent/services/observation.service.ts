import { Injectable, Logger } from '@nestjs/common';
import {
  AgentToolCallResult,
  SSEObservationData,
} from '@echolife/shared';

/**
 * Observation — surfaces tool/workflow results as observations that can
 * be streamed to the client and fed back into the reasoning loop.
 */
@Injectable()
export class ObservationService {
  private readonly logger = new Logger(ObservationService.name);

  /**
   * Convert a tool result into an observation payload.
   */
  observeToolResult(result: AgentToolCallResult): SSEObservationData {
    return {
      source: result.tool,
      success: result.success,
      summary: result.summary,
      data: result.data,
    };
  }

  /**
   * Build a compact context string from tool results for the final
   * response-generation prompt.
   */
  buildObservationContext(results: AgentToolCallResult[]): string {
    if (results.length === 0) return '';
    const lines = results
      .map((r) => `- ${r.tool}（${r.success ? '成功' : '失败'}）：${r.summary}`)
      .join('\n');
    return `\n\n【工具调用结果】\n${lines}`;
  }
}
