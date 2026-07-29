import { Module } from '@nestjs/common';
import { LifeTreeService } from './lifetree.service';
import { LifeTreeController } from './lifetree.controller';

@Module({
  providers: [LifeTreeService],
  controllers: [LifeTreeController],
  exports: [LifeTreeService],
})
export class LifeTreeModule {}
