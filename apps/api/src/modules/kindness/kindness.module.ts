import { Module } from '@nestjs/common';
import { KindnessService } from './kindness.service';
import { KindnessController } from './kindness.controller';
import { MemoryModule } from '../memory/memory.module';
import { AiModule } from '../ai/ai.module';

/**
 * KindnessModule — 童忆引擎模块
 *
 * 童年陪伴记忆引擎，将95后童年时期少儿频道公益广告带来的
 * 「陪伴感、温暖感、家庭感」转化为AI时代的家庭陪伴能力。
 *
 * 依赖：
 * - MemoryModule: 所有数据进入 Family Memory Graph
 * - AiModule: LLM 适配器用于故事生成和温暖识别
 */
@Module({
  imports: [MemoryModule, AiModule],
  providers: [KindnessService],
  controllers: [KindnessController],
  exports: [KindnessService],
})
export class KindnessModule {}
