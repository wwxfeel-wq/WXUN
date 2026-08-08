import { Injectable, Logger } from '@nestjs/common';
import { MemoryTools } from './tools/memory.tools';
import { KnowledgeTools } from './tools/knowledge.tools';
import { NotificationTools } from './tools/notification.tools';
import { FamilyTools } from './tools/family.tools';
import { WebBrowseTools } from './tools/web-browse.tools';
import { ResearchTools } from './tools/research.tools';
import { KindnessTools } from './tools/kindness.tools';
import { ScreenshotTools } from './tools/screenshot.tools';
import { IoTTools } from './tools/iot.tools';
import type {
  McpToolContext,
  McpToolDefinition,
  McpToolParametersSchema,
  McpToolResult,
  McpToolSchema,
} from './types/tool-registry.types';

/**
 * EchoLife MCP Tool Registry
 *
 * Central registry for schema-first tools inspired by the Model Context Protocol.
 * Responsibilities:
 *  - register(tool): register a tool definition
 *  - discover(): list tool schemas (without handlers) for LLM/agent discovery
 *  - getSchema(name): get a single tool schema
 *  - execute(name, args, ctx): validate parameters and run the handler
 *
 * Existing tools from {@link AgentToolService} are bridged in by delegating
 * structured calls to the registry when a matching definition exists.
 */
@Injectable()
export class McpToolRegistry {
  private readonly logger = new Logger(McpToolRegistry.name);
  private readonly tools = new Map<string, McpToolDefinition>();

  constructor(
    private readonly memoryTools: MemoryTools,
    private readonly knowledgeTools: KnowledgeTools,
    private readonly notificationTools: NotificationTools,
    private readonly familyTools: FamilyTools,
    private readonly webBrowseTools: WebBrowseTools,
    private readonly researchTools: ResearchTools,
    private readonly kindnessTools: KindnessTools,
    private readonly screenshotTools: ScreenshotTools,
    private readonly iotTools: IoTTools,
  ) {
    this.registerBuiltInTools();
  }

  // ============================================================
  // Registration
  // ============================================================

  /**
   * Register a single tool definition.
   */
  register(tool: McpToolDefinition): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`MCP tool "${tool.name}" is being overwritten`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tool definitions.
   */
  registerMany(tools: McpToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  // ============================================================
  // Discovery
  // ============================================================

  /**
   * Return all registered tool schemas without handlers.
   */
  discover(): McpToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => this.toSchema(tool));
  }

  /**
   * Return schema for a specific tool, or undefined if not found.
   */
  getSchema(name: string): McpToolSchema | undefined {
    const tool = this.tools.get(name);
    return tool ? this.toSchema(tool) : undefined;
  }

  /**
   * Return the raw tool definition (including handler).
   */
  getDefinition(name: string): McpToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check whether a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  // ============================================================
  // Execution
  // ============================================================

  /**
   * Execute a registered tool by name with structured arguments.
   *
   * Validates required parameters before invoking the handler and normalizes
   * the result into an {@link McpToolResult}.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        tool: name,
        success: false,
        summary: `未找到工具：${name}`,
      };
    }

    const validation = this.validateParameters(tool.parameters, args);
    if (!validation.valid) {
      return {
        tool: name,
        success: false,
        summary: `参数校验失败：${validation.reason}`,
      };
    }

    try {
      const result = await tool.handler(args, ctx);
      return { ...result, tool: result.tool ?? name };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`MCP tool "${name}" failed: ${msg}`);
      return {
        tool: name,
        success: false,
        summary: `工具执行失败：${msg}`,
      };
    }
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private registerBuiltInTools(): void {
    this.registerMany(this.memoryTools.getDefinitions());
    this.registerMany(this.knowledgeTools.getDefinitions());
    this.registerMany(this.notificationTools.getDefinitions());
    this.registerMany(this.familyTools.getDefinitions());
    this.registerMany(this.webBrowseTools.getDefinitions());
    this.registerMany(this.researchTools.getDefinitions());
    this.registerMany(this.kindnessTools.getDefinitions());
    this.registerMany(this.screenshotTools.getDefinitions());
    this.registerMany(this.iotTools.getDefinitions());
  }

  private toSchema(tool: McpToolDefinition): McpToolSchema {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  private validateParameters(
    schema: McpToolParametersSchema,
    args: Record<string, unknown>,
  ): { valid: true } | { valid: false; reason: string } {
    const required = schema.required ?? [];
    for (const key of required) {
      const value = args[key];
      if (value === undefined || value === null || value === '') {
        return {
          valid: false,
          reason: `缺少必填参数 "${key}"`,
        };
      }
    }

    // R2-BE-010: 验证参数类型和格式
    const properties = schema.properties ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = args[key];
      if (value === undefined || value === null) continue;

      const expectedType = propSchema.type;

      // 类型校验
      if (expectedType === 'string' && typeof value !== 'string') {
        return { valid: false, reason: `参数 "${key}" 应为 string 类型` };
      }
      if (expectedType === 'number' && typeof value !== 'number') {
        return { valid: false, reason: `参数 "${key}" 应为 number 类型` };
      }
      if (expectedType === 'integer' && !Number.isInteger(value)) {
        return { valid: false, reason: `参数 "${key}" 应为 integer 类型` };
      }
      if (expectedType === 'boolean' && typeof value !== 'boolean') {
        return { valid: false, reason: `参数 "${key}" 应为 boolean 类型` };
      }
      if (expectedType === 'array' && !Array.isArray(value)) {
        return { valid: false, reason: `参数 "${key}" 应为 array 类型` };
      }
      if (
        expectedType === 'object' &&
        (typeof value !== 'object' || Array.isArray(value))
      ) {
        return { valid: false, reason: `参数 "${key}" 应为 object 类型` };
      }

      // enum 校验
      if (
        propSchema.enum &&
        !propSchema.enum.includes(value as string | number | boolean)
      ) {
        return {
          valid: false,
          reason: `参数 "${key}" 的值不在允许范围内: ${propSchema.enum.join(', ')}`,
        };
      }

      // pattern 正则校验（大小写不敏感，与 handler 行为一致）
      if (
        expectedType === 'string' &&
        typeof value === 'string' &&
        propSchema.pattern
      ) {
        try {
          const regex = new RegExp(propSchema.pattern, 'i');
          if (!regex.test(value)) {
            return {
              valid: false,
              reason: `参数 "${key}" 不符合格式要求: ${propSchema.pattern}`,
            };
          }
        } catch {
          this.logger.warn(
            `Invalid regex pattern for parameter ${key}: ${propSchema.pattern}`,
          );
        }
      }
    }

    return { valid: true };
  }
}
