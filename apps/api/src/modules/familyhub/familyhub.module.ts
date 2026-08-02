import { Module, forwardRef } from '@nestjs/common';
import { FamilyHubController } from './familyhub.controller';
import { FamilyHubService } from './familyhub.service';
import { SpamFilterService } from './spam-filter.service';
import { SkillsEvolutionService } from './skills-evolution.service';
import { SkillsInvocationService } from './skills-invocation.service';
import { AgentToolService } from './agent-tool.service';
import { AgentWorkflowService } from './agent-workflow.service';
import { HabitAnalyzerService } from '../agent/services/habit-analyzer.service';
import { AiModule } from '../ai/ai.module';
import { WechatModule } from '../wechat/wechat.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { ToolRegistryModule } from '../agent/tool-registry/tool-registry.module';
import { LifeTreeModule } from '../lifetree/lifetree.module';

@Module({
  imports: [AiModule, forwardRef(() => WechatModule), KnowledgeModule, MemoryModule, ToolRegistryModule, LifeTreeModule],
  controllers: [FamilyHubController],
  providers: [
    FamilyHubService,
    SpamFilterService,
    SkillsEvolutionService,
    SkillsInvocationService,
    AgentToolService,
    AgentWorkflowService,
    HabitAnalyzerService,
  ],
  exports: [
    FamilyHubService,
    SpamFilterService,
    SkillsEvolutionService,
    SkillsInvocationService,
    AgentToolService,
    AgentWorkflowService,
  ],
})
export class FamilyHubModule {}
