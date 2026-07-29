import { Module } from '@nestjs/common';
import { CapsuleService } from './capsule.service';
import { CapsuleController } from './capsule.controller';

@Module({
  providers: [CapsuleService],
  controllers: [CapsuleController],
  exports: [CapsuleService],
})
export class CapsuleModule {}
