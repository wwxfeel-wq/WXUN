/**
 * EchoLife MCP Tool Registry Types
 *
 * Schema-first tool definitions inspired by the Model Context Protocol (MCP).
 * Each tool declares its JSON-schema parameters and a typed handler so it can
 * be discovered by agents and invoked safely at runtime.
 */

/** Primitive JSON schema property types used for tool parameters. */
export type McpToolParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'integer'
  | 'array'
  | 'object';

/** A single parameter schema entry. */
export interface McpToolParameterSchema {
  type: McpToolParameterType;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  /** For array items. */
  items?: McpToolParameterSchema;
  /** For object properties. */
  properties?: Record<string, McpToolParameterSchema>;
  required?: string[];
}

/** JSON-schema-like object describing the tool parameters. */
export interface McpToolParametersSchema {
  type: 'object';
  properties: Record<string, McpToolParameterSchema>;
  required?: string[];
}

/** Context passed to every MCP tool handler. */
export interface McpToolContext {
  userId: string;
  agentCode: string;
  message?: string;
}

/** Result returned by an MCP tool handler. */
export interface McpToolResult {
  tool: string;
  success: boolean;
  summary: string;
  data?: unknown;
}

/** Handler signature for an MCP tool. */
export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: McpToolContext,
) => Promise<McpToolResult>;

/** A registered MCP tool definition. */
export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: McpToolParametersSchema;
  handler: McpToolHandler;
}

/** Discovery response exposing tool schemas without handlers. */
export interface McpToolSchema {
  name: string;
  description: string;
  parameters: McpToolParametersSchema;
}
