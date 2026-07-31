import { Module } from '@nestjs/common';
import { MemoryModule } from '../../memory/memory.module';
import { KnowledgeModule } from '../../knowledge/knowledge.module';
import { NotificationModule } from '../../notification/notification.module';
import { AiModule } from '../../ai/ai.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { MemoryTools } from './tools/memory.tools';
import { KnowledgeTools } from './tools/knowledge.tools';
import { NotificationTools } from './tools/notification.tools';
import { FamilyTools } from './tools/family.tools';
import { WebBrowseTools } from './tools/web-browse.tools';
import { ResearchTools } from './tools/research.tools';
import { McpToolRegistry } from './mcp-tool-registry.service';

/**
 * EchoLife MCP Tool Registry Module
 *
 * Provides schema-first, executable tools that can be discovered and invoked
 * by agents, skills, and the runtime pipeline. Imported by both the
 * {@link AgentModule} and {@link FamilyHubModule} so that structured tool
 * calls and skill ability invocations share the same handlers.
 */
@Module({
  imports: [
    PrismaModule,
    MemoryModule,
    KnowledgeModule,
    NotificationModule,
    AiModule,
  ],
  providers: [MemoryTools, KnowledgeTools, NotificationTools, FamilyTools, WebBrowseTools, ResearchTools, McpToolRegistry],
  exports: [McpToolRegistry, MemoryTools, KnowledgeTools, NotificationTools, FamilyTools, WebBrowseTools, ResearchTools],
})
export class ToolRegistryModule {}
