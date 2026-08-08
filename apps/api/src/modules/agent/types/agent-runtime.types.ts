import {
  AgentRuntimeInput,
  AgentRuntimeContext,
  SSEEvent,
} from '@echolife/shared';

/** Execution context passed between AgentRuntime pipeline stages */
export type { AgentRuntimeInput, AgentRuntimeContext, SSEEvent };

/** Tool schema definition for structured tool calling */
export interface ToolParameterSchema {
  type: string;
  description: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
}

/** Workflow descriptor used by the workflow engine */
export interface WorkflowDescriptor {
  name: string;
  description: string;
  trigger: string[];
}

/** Family context snapshot assembled by the Memory Bridge */
export interface FamilyContext {
  families: Array<{ id: string; name: string; role: string }>;
  members: Array<{ id: string; nickname: string | null; familyId: string }>;
  knowledgeGraphSummary: string;
}

/** User context loaded at the start of a pipeline run */
export interface LoadedUserContext {
  userId: string;
  nickname: string;
  aiTemperature: number;
  recentMessageHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  formattedRecentMessages: string;
  formattedMemories: string;
  formattedPersonality: string;
  personality?: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    analysis?: string | null;
  };
}
