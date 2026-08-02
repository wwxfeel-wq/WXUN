import { Global, Module, forwardRef } from '@nestjs/common';
import { AgentRuntimeService } from './services/agent-runtime.service';
import { ShimoPersonaService } from './services/shimo-persona.service';
import { PlannerService } from './services/planner.service';
import { ReasoningService } from './services/reasoning.service';
import { MemoryBridgeService } from './services/memory-bridge.service';
import { ToolCallingService } from './services/tool-calling.service';
import { ObservationService } from './services/observation.service';
import { ActionService } from './services/action.service';
import { WorkflowEngineService } from './services/workflow-engine.service';
import { SchedulerService } from './services/scheduler.service';
import { EmotionEngineService } from './services/emotion-engine.service';
import { HabitAnalyzerService } from './services/habit-analyzer.service';
import { AgentRuntimeProvider } from './providers/agent-runtime.provider';
import { OpenClawProvider } from './providers/openclaw.provider';
import { AiModule } from '../ai/ai.module';
import { FamilyHubModule } from '../familyhub/familyhub.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { ToolRegistryModule } from './tool-registry/tool-registry.module';

@Global()
@Module({
  imports: [AiModule, forwardRef(() => FamilyHubModule), KnowledgeModule, PrismaModule, RedisModule, ToolRegistryModule],
  providers: [
    AgentRuntimeService,
    ShimoPersonaService,
    PlannerService,
    ReasoningService,
    MemoryBridgeService,
    ToolCallingService,
    ObservationService,
    ActionService,
    WorkflowEngineService,
    SchedulerService,
    EmotionEngineService,
    HabitAnalyzerService,
    {
      provide: AgentRuntimeProvider,
      useClass: OpenClawProvider,
    },
  ],
  exports: [AgentRuntimeService, EmotionEngineService, HabitAnalyzerService],
})
export class AgentModule {}
