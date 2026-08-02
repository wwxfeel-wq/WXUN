import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ApiKeyController } from './api-key.controller';
import { DemoController } from './demo.controller';
import { AgentActivityController } from './agent-activity.controller';
import { LlmAdapterService } from './services/llm-adapter.service';
import { ApiKeyService } from './services/api-key.service';
import { DemoService } from './services/demo.service';
import { PromptService } from './services/prompt.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';
import { QuotaService } from './services/quota.service';
import { AgentOrchestratorService } from './services/agent-orchestrator.service';
import { WebSearchService } from './services/web-search.service';
import { ScreenshotService } from './services/screenshot.service';
import { AgentEcosystemService } from './services/agent-ecosystem.service';
// SkillsEvolutionService is provided here (not via importing FamilyHubModule)
// to avoid a circular dependency — FamilyHubModule already imports AiModule.
// Its only dependency is the globally-available PrismaService.
import { SkillsEvolutionService } from '../familyhub/skills-evolution.service';

@Module({
  controllers: [AiController, ApiKeyController, DemoController, AgentActivityController],
  providers: [
    LlmAdapterService,
    ApiKeyService,
    DemoService,
    PromptService,
    EmbeddingService,
    RagService,
    QuotaService,
    AgentOrchestratorService,
    WebSearchService,
    ScreenshotService,
    AgentEcosystemService,
    SkillsEvolutionService,
  ],
  exports: [
    AgentOrchestratorService,
    QuotaService,
    RagService,
    EmbeddingService,
    PromptService,
    LlmAdapterService,
    ApiKeyService,
    AgentEcosystemService,
    WebSearchService,
    ScreenshotService,
  ],
})
export class AiModule {}
