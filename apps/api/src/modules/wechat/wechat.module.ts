import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { MemoryModule } from '../memory/memory.module';
import { SummaryModule } from '../summary/summary.module';
import { CapsuleModule } from '../capsule/capsule.module';
import { NotificationModule } from '../notification/notification.module';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    MemoryModule,
    SummaryModule,
    CapsuleModule,
    NotificationModule,
  ],
  controllers: [WechatController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
