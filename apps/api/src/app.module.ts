import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { EncryptionUtil } from './common/utils/encryption.util';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MemoryModule } from './modules/memory/memory.module';
import { InterviewModule } from './modules/interview/interview.module';
import { AiModule } from './modules/ai/ai.module';
import { AgentModule } from './modules/agent/agent.module';
import { LifeTreeModule } from './modules/lifetree/lifetree.module';
import { PersonalityModule } from './modules/personality/personality.module';
import { FamilyModule } from './modules/family/family.module';
import { CapsuleModule } from './modules/capsule/capsule.module';
import { SummaryModule } from './modules/summary/summary.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';
import { StatsModule } from './modules/stats/stats.module';
import { FamilyHubModule } from './modules/familyhub/familyhub.module';
import { WechatModule } from './modules/wechat/wechat.module';
import { KindnessModule } from './modules/kindness/kindness.module';
import { IoTModule } from './modules/iot/iot.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Rate limiting (100 requests per minute)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Infrastructure
    CommonModule,
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    UserModule,
    MemoryModule,
    InterviewModule,
    AgentModule,
    AiModule,
    LifeTreeModule,
    PersonalityModule,
    FamilyModule,
    CapsuleModule,
    SummaryModule,
    KnowledgeModule,
    NotificationModule,
    AdminModule,
    StatsModule,
    FamilyHubModule,
    WechatModule,
    KindnessModule,
    IoTModule,
  ],
  providers: [
    // Global rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT authentication (all routes require auth unless @Public)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [],
})
export class AppModule {}
