import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AiModule } from '../ai/ai.module';
import { MemoryModule } from '../memory/memory.module';
import { SummaryModule } from '../summary/summary.module';
import { CapsuleModule } from '../capsule/capsule.module';
import { NotificationModule } from '../notification/notification.module';
import { WechatController } from './wechat.controller';
import { OpenClawWebhookController } from './openclaw-webhook.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    AiModule,
    MemoryModule,
    SummaryModule,
    CapsuleModule,
    NotificationModule,
  ],
  controllers: [WechatController, OpenClawWebhookController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
