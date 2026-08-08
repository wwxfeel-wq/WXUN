/**
 * OpenClaw Webhook Controller
 * ─────────────────────────────────────
 * 接收 OpenClaw 网关转发的微信消息，联动 EchoLife AgentRuntime pipeline。
 *
 * 架构:
 *   微信用户 ←→ OpenClaw (+ openclaw-weixin 插件) ←→ 本 Webhook ←→ AgentRuntime
 *
 * OpenClaw 负责:
 *   - 扫码登录 (QR code)
 *   - iLink 协议 (消息收发)
 *   - 消息路由到本 webhook
 *
 * EchoLife 负责:
 *   - Agent 推理 (时墨人格 + 全部 Agent/Skills)
 *   - 家庭成员识别
 *   - 记忆持久化
 *   - 主动服务触发
 *
 * 认证: 通过 OPENCLAW_WEBHOOK_SECRET 环境变量共享密钥
 */

import {
  Body,
  Controller,
  Post,
  HttpCode,
  Logger,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { WechatService } from './wechat.service';
import { AgentRuntimeService } from '../agent/services/agent-runtime.service';
import { SSEEventType } from '@echolife/shared';

/** OpenClaw webhook 请求体 */
interface OpenClawWebhookBody {
  /** 消息内容 */
  content: string;
  /** 发送者微信 ID */
  fromUserId: string;
  /** 发送者昵称 */
  fromUserName?: string;
  /** 消息类型: text / image / voice / file */
  messageType?: string;
  /** 会话 ID */
  sessionId?: string;
  /** OpenClaw 通道名称 */
  channel?: string;
}

/** OpenClaw webhook 响应体 */
interface OpenClawWebhookResponse {
  reply: string;
  success: boolean;
  error?: string;
}

@ApiTags('OpenClaw Webhook')
@Controller('openclaw')
@Public()
export class OpenClawWebhookController {
  private readonly logger = new Logger(OpenClawWebhookController.name);

  constructor(
    private readonly wechatService: WechatService,
    private readonly agentRuntime: AgentRuntimeService,
  ) {}

  /**
   * 接收 OpenClaw 转发的微信消息
   *
   * POST /api/v1/openclaw/webhook
   *
   * Headers:
   *   X-Webhook-Secret: <OPENCLAW_WEBHOOK_SECRET>
   *
   * Body:
   *   { content, fromUserId, fromUserName, messageType, sessionId, channel }
   *
   * Response:
   *   { reply, success }
   */
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: '接收 OpenClaw 转发的微信消息，联动 Agent pipeline' })
  async handleWebhook(
    @Body() body: OpenClawWebhookBody,
    @Headers('x-webhook-secret') secret: string,
  ): Promise<OpenClawWebhookResponse> {
    // 验证共享密钥（使用 timingSafeEqual 防止时序攻击）
    const expectedSecret = process.env.OPENCLAW_WEBHOOK_SECRET;
    if (!expectedSecret) {
      this.logger.error('OPENCLAW_WEBHOOK_SECRET not configured in environment');
      throw new UnauthorizedException('Webhook secret not configured');
    }
    const secretBuf = Buffer.from(secret ?? '');
    const expectedBuf = Buffer.from(expectedSecret);
    if (secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
      this.logger.warn(`Invalid webhook secret from OpenClaw`);
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const { content, fromUserId, fromUserName, messageType } = body;

    if (!content || !fromUserId) {
      return { reply: '', success: false, error: 'Missing content or fromUserId' };
    }

    // 只处理文本消息
    if (messageType && messageType !== 'text') {
      this.logger.debug(`Skipping non-text message type: ${messageType}`);
      return { reply: '', success: false, error: 'Non-text message not supported' };
    }

    this.logger.log(
      `OpenClaw webhook: from=${fromUserName ?? fromUserId}, content=${content.substring(0, 80)}`,
    );

    // 同步联系人
    await this.wechatService.syncContactFromOpenClaw(fromUserId, fromUserName ?? fromUserId);

    // 通过微信 ID 识别绑定的家庭成员
    const member = await this.wechatService.resolveFamilyMemberByWechatId(fromUserId, fromUserName ?? '');

    if (!member) {
      this.logger.debug(`No family member binding for WeChat ID ${fromUserId}`);
      return {
        reply: '你好呀～我是时墨，现在还不认识你呢。请先在岁言 App 里绑定你的微信身份，我就能记住你啦 ✨',
        success: true,
      };
    }

    // 送入 AgentRuntime pipeline (时墨 + 全部 Agent/Skills)
    let reply = '';
    try {
      for await (const event of this.agentRuntime.run({
        userId: member.userId,
        message: content,
        mode: 'wechat',
      })) {
        if (event.type === SSEEventType.TOKEN) {
          reply += event.data.content;
        } else if (event.type === SSEEventType.ERROR) {
          this.logger.error(`Agent error: ${event.data.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Agent pipeline failed: ${(err as Error).message}`);
      reply = '抱歉，我刚才走神了，能再说一遍吗？';
    }

    // 异步持久化消息和触发主动服务（不阻塞回复）
    void this.wechatService.persistOpenClawMessage(
      member,
      content,
      fromUserId,
      fromUserName ?? fromUserId,
      reply,
    );

    return { reply: reply.trim() || '我在听呢，继续说～', success: true };
  }

  /**
   * 健康检查端点（OpenClaw 用于探活）
   */
  @Post('health')
  @HttpCode(200)
  @ApiOperation({ summary: 'OpenClaw webhook 健康检查' })
  health(): { status: string; timestamp: number } {
    return { status: 'ok', timestamp: Date.now() };
  }
}
