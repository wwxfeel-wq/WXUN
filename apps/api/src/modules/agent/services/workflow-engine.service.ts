import { Injectable, Logger } from '@nestjs/common';
import {
  AgentWorkflowService,
  WorkflowResult,
} from '../../familyhub/agent-workflow.service';
import { SSEWorkflowStepData } from '@echolife/shared';
import type { WorkflowDescriptor } from '../types/agent-runtime.types';

/**
 * WorkflowEngine — wraps the existing AgentWorkflowService with a
 * dispatcher and emits workflow_step SSE events.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(private readonly agentWorkflowService: AgentWorkflowService) {}

  /**
   * List workflows known to the engine.
   */
  listWorkflows(): WorkflowDescriptor[] {
    return [
      {
        name: 'memory_extraction',
        description: '从对话中提取关键事实并保存为记忆',
        trigger: ['life_coach', 'story_agent'],
      },
      {
        name: 'story_generation',
        description: '收集记忆并生成叙事故事',
        trigger: ['story_agent'],
      },
      {
        name: 'emotion_analysis',
        description: '分析情绪并保存情绪记忆',
        trigger: ['emotion', 'life_coach'],
      },
      {
        name: 'health_check',
        description: '解析健康指标并提供建议',
        trigger: ['health'],
      },
    ];
  }

  /**
   * Decide which workflows should run for the current agent/mode.
   */
  selectWorkflows(agentCode: string, message: string): string[] {
    const selected: string[] = [];

    if (agentCode === 'life_coach' || agentCode === 'story_agent') {
      selected.push('memory_extraction');
    }

    if (agentCode === 'story_agent' && /故事|写成|叙事/.test(message)) {
      selected.push('story_generation');
    }

    if (agentCode === 'health') {
      selected.push('health_check');
    }

    if (agentCode === 'emotion') {
      selected.push('emotion_analysis');
    }

    return selected;
  }

  /**
   * Run a named workflow with the provided input.
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
    try {
      return await this.agentWorkflowService.runWorkflow(name, input);
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`Workflow ${name} failed: ${msg}`);
      return {
        workflow: name,
        steps: [{ name: 'execute', status: 'failed', detail: msg }],
        output: `工作流 ${name} 执行失败：${msg}`,
      };
    }
  }

  /**
   * Convert a WorkflowResult into SSE workflow_step payloads.
   */
  toWorkflowStepEvents(result: WorkflowResult): SSEWorkflowStepData[] {
    return result.steps.map((s) => ({
      workflow: result.workflow,
      step: s.name,
      status: s.status,
      detail: s.detail,
    }));
  }
}
