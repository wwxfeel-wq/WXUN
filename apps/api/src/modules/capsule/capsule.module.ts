import { Module } from '@nestjs/common';
import { CapsuleService } from './capsule.service';
import { CapsuleController } from './capsule.controller';
import { AiModule } from '../ai/ai.module';

/**
 * CapsuleModule — 时间胶囊模块
 *
 * 童忆引擎扩展：Memory Capsule 支持媒体附件和 AI 重述，
 * 需要 AiModule 提供 LLM 适配器。
 */
@Module({
  imports: [AiModule],
  providers: [CapsuleService],
  controllers: [CapsuleController],
  exports: [CapsuleService],
})
export class CapsuleModule {}
