import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { MemoryProcessingService } from './memory-processing.service';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [AiModule, KnowledgeModule],
  providers: [MemoryService, MemoryProcessingService],
  controllers: [MemoryController],
  exports: [MemoryService, MemoryProcessingService],
})
export class MemoryModule {}
