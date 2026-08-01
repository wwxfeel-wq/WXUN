import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SSEEventType,
  MemoryType,
  MemoryVisibility,
  SummaryPeriod,
  CapsuleType,
} from '@echolife/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AgentRuntimeService } from '../agent/services/agent-runtime.service';
import { MemoryService } from '../memory/memory.service';
import { CreateMemoryDto } from '../memory/dto/create-memory.dto';
import { SummaryService } from '../summary/summary.service';
import { GenerateSummaryDto } from '../summary/dto/generate-summary.dto';
import { CapsuleService } from '../capsule/capsule.service';
import { CreateCapsuleDto } from '../capsule/dto/create-capsule.dto';
import { NotificationService, CreateNotificationPayload } from '../notification/notification.service';
import { ILinkClient } from './ilink-client';
import { ILinkInboundMessage } from './ilink.types';

export interface WechatStatus {
  connected: boolean;
  loggedIn: boolean;
  userNickName: string | null;
  qrCodeUrl: string | null;
  phase: 'idle' | 'waiting_scan' | 'waiting_confirm' | 'logged_in' | 'logged_out' | 'error';
  contactCount: number;
  lastError: string | null;
}

export interface WechatContactDto {
  id: string;
  name: string;
  remarkName: string;
  avatar: string;
  type: 'friend' | 'group' | 'official' | 'special';
  isStar: boolean;
  signature: string;
}

export interface WechatMessageDto {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
  type: 'text' | 'image' | 'voice' | 'file' | 'other';
  contactId: string;
  senderWechatId?: string;
}

export interface BindFamilyMemberPayload {
  familyMemberId: string;
  wechatId?: string;
  wechatNickname?: string;
  wechatAlias?: string;
}

/**
 * Agent 实时活动事件，用于向前端 SSE 推送 agent 的思考/工具调用/输出过程。
 */
export interface AgentActivityEvent {
  type: 'thinking' | 'tool_call' | 'observation' | 'token' | 'done' | 'error';
  contactId: string;
  senderName: string;
  content?: string;
  toolName?: string;
  timestamp: number;
}

/** context_token 缓存条目 — 每个用户的最新 context_token */
interface ContextTokenEntry {
  token: string;
  updatedAt: number;
}

/** typing_ticket 缓存条目 — 每个用户的最新 typing_ticket */
interface TypingTicketEntry {
  ticket: string;
  contextToken: string;
  updatedAt: number;
}

/** 扫码状态轮询间隔 */
const QR_POLL_INTERVAL_MS = 2000;
/** 扫码超时（5 分钟） */
const QR_POLL_TIMEOUT_MS = 5 * 60 * 1000;
/** 长轮询错误后重试延迟 */
const POLL_RETRY_DELAY_MS = 3000;
/** context_token 缓存有效期（30 分钟） */
const CONTEXT_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * WechatService - 微信官方 ClawBot iLink 协议集成
 *
 * 2026 迁移: 从 wechat4u (模拟网页版) 迁移到官方 iLink Bot API
 *  - 扫码登录通过 get_bot_qrcode + get_qrcode_status 实现
 *  - 消息接收通过 getupdates 长轮询（35s hold）
 *  - 消息回复通过 sendmessage，必须带 context_token
 *  - 收到的消息流入 AgentRuntime pipeline (时墨)
 *  - 家庭成员通过微信 ID 绑定识别
 *  - 消息和联系人持久化到 PostgreSQL / Redis
 *  - 主动服务（提醒、总结、时间胶囊）根据消息内容触发
 */
@Injectable()
export class WechatService implements OnModuleDestroy {
  private readonly logger = new Logger(WechatService.name);
  private readonly ilink = new ILinkClient();

  private qrCodeUrl: string | null = null;
  private loggedIn = false;
  private userNickName: string | null = null;
  private phase: WechatStatus['phase'] = 'idle';
  private lastError: string | null = null;

  /** 长轮询游标 */
  private updateCursor = '';
  /** 长轮询是否正在运行 */
  private isPolling = false;
  /** 长轮询停止标志 */
  private shouldStopPolling = false;
  /** 扫码轮询是否正在运行 */
  private isQrPolling = false;

  /** bot_token（登录后获得，可用于重连） */
  private botToken: string | null = null;
  /** bot_id (xxx@im.bot) */
  private botId: string | null = null;
  /** 扫码人的微信 ID (xxx@im.wechat) */
  private botUserId: string | null = null;
  /** 二维码 key（用于轮询扫码状态） */
  private qrCodeKey: string | null = null;

  /** context_token 缓存：userId → { token, updatedAt } */
  private contextTokenCache = new Map<string, ContextTokenEntry>();

  /** typing_ticket 缓存：userId → { ticket, contextToken, updatedAt } */
  private typingTicketCache = new Map<string, TypingTicketEntry>();

  /** Auto-reconnect state */
  private syncFailCount = 0;
  private readonly maxSyncRetries = 5;
  private isReconnecting = false;
  /** 自动重连的时间窗口起点 */
  private reconnectStartedAt: number | null = null;
  private readonly maxReconnectWindowMs = 5 * 60 * 1000;

  /** Callbacks for incoming messages (used by controller for SSE push) */
  private messageListeners: Array<(msg: WechatMessageDto) => void> = [];

  /** Callbacks for agent real-time activity events */
  private agentActivityListeners: Array<(event: AgentActivityEvent) => void> = [];

  /** 当前正在处理的 agent 请求计数 */
  private activeAgentCount = 0;

  /** 排队中的消息数 */
  private pendingMessages = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly agentRuntime: AgentRuntimeService,
    private readonly memoryService: MemoryService,
    private readonly summaryService: SummaryService,
    private readonly capsuleService: CapsuleService,
    private readonly notificationService: NotificationService,
  ) {
    // 尝试从环境变量加载已有 token（支持服务器重启后自动恢复）
    const envToken = process.env.WECHAT_BOT_TOKEN;
    if (envToken) {
      this.botToken = envToken;
      this.ilink.setBotToken(envToken);
      this.logger.log('Found WECHAT_BOT_TOKEN in env, will attempt auto-reconnect');
    }
  }

  // ============================================================
  // 登录流程
  // ============================================================

  /**
   * 启动微信 ClawBot 登录流程
   * 1. 调用 get_bot_qrcode 获取二维码
   * 2. 异步轮询 get_qrcode_status 等待扫码确认
   * 3. 确认后保存 bot_token，启动长轮询
   */
  async startLogin(): Promise<{ qrCodeUrl: string }> {
    // 如果已有 token 且已登录，直接返回
    if (this.loggedIn && this.botToken) {
      return { qrCodeUrl: '' };
    }

    // 如果已有 token（从 env 或之前的登录），尝试直接启动长轮询
    if (this.botToken && this.ilink.hasToken && !this.loggedIn) {
      this.logger.log('Attempting to start polling with existing bot_token...');
      this.phase = 'logged_in';
      this.loggedIn = true;
      this.userNickName = 'ClawBot';
      this.startPollingLoop();
      return { qrCodeUrl: '' };
    }

    // 重置状态
    this.phase = 'idle';
    this.qrCodeUrl = null;
    this.lastError = null;

    try {
      // Step 1: 获取二维码
      const qrResponse = await this.ilink.getBotQrCode();

      this.qrCodeUrl = qrResponse.qrcode_img_content;
      this.qrCodeKey = qrResponse.qrcode;
      this.phase = 'waiting_scan';
      this.logger.log('iLink QR code generated, waiting for scan...');

      // Step 2: 异步轮询扫码状态
      if (this.qrCodeKey) {
        void this.pollQrCodeStatus(this.qrCodeKey);
      } else {
        // 如果没有 qrcode key，无法轮询
        this.logger.warn('No qrcode key in QR response, polling may not work');
      }

      return { qrCodeUrl: this.qrCodeUrl };
    } catch (err) {
      const errMsg = (err as Error).message;
      this.logger.error(`iLink login failed: ${errMsg}`);
      this.phase = 'error';
      this.lastError = errMsg;
      throw new Error(`微信 ClawBot 登录失败: ${errMsg}`);
    }
  }

  /**
   * 轮询扫码状态，直到确认登录或超时
   * 官方协议状态值: scaned(已扫码) / confirmed(已确认) / expired(已过期)
   * 注意: get_qrcode_status 是长轮询，超时是正常行为
   */
  private async pollQrCodeStatus(qrcodeKey: string): Promise<void> {
    if (this.isQrPolling) return;
    this.isQrPolling = true;

    const startTime = Date.now();

    try {
      while (
        !this.shouldStopPolling &&
        !this.loggedIn &&
        Date.now() - startTime < QR_POLL_TIMEOUT_MS
      ) {
        if (this.shouldStopPolling || this.loggedIn) break;

        try {
          const status = await this.ilink.getQrCodeStatus(qrcodeKey);

          switch (status.status) {
            case 'scaned':
              // 已扫码，等待手机确认
              this.phase = 'waiting_confirm';
              this.logger.log('QR code scanned, waiting for confirm on phone...');
              break;

            case 'confirmed':
              // 登录成功！
              if (status.bot_token) {
                this.botToken = status.bot_token;
                this.botId = status.ilink_bot_id || null;
                this.botUserId = status.ilink_user_id || null;
                this.ilink.setBotToken(status.bot_token);
                this.loggedIn = true;
                this.phase = 'logged_in';
                this.syncFailCount = 0;
                this.isReconnecting = false;
                this.reconnectStartedAt = null;
                this.userNickName = 'ClawBot';

                this.logger.log(
                  `iLink login confirmed! Bot ID: ${this.botId}, User ID: ${this.botUserId}`,
                );

                // 启动长轮询接收消息
                this.startPollingLoop();
              } else {
                this.logger.error('Login confirmed but no bot_token received');
                this.phase = 'error';
                this.lastError = '登录确认但未收到 bot_token';
              }
              return;

            case 'expired':
              this.phase = 'error';
              this.lastError = '二维码已过期，请重新扫码';
              this.logger.warn('iLink QR code expired');
              return;
          }
        } catch (err) {
          // get_qrcode_status 是长轮询，超时是正常行为
          const msg = (err as Error).message;
          if (msg.includes('timeout') || msg.includes('TimeoutError') || msg.includes('abort')) {
            this.logger.debug('QR status long-poll timeout (normal), retrying...');
            continue;
          }
          this.logger.warn(`QR status poll error: ${msg}`);
          // 继续轮询，不因单次错误中断
          await new Promise((resolve) => setTimeout(resolve, QR_POLL_INTERVAL_MS));
        }
      }

      // 超时
      if (!this.loggedIn && !this.shouldStopPolling) {
        this.phase = 'error';
        this.lastError = '扫码超时，请重新登录';
        this.logger.warn('iLink QR code scan timed out');
      }
    } finally {
      this.isQrPolling = false;
    }
  }

  // ============================================================
  // 长轮询消息接收
  // ============================================================

  /**
   * 启动长轮询循环
   * 服务器会 hold 住最多 35 秒，直到有新消息才返回
   */
  private startPollingLoop(): void {
    if (this.isPolling) {
      this.logger.warn('Polling loop already running');
      return;
    }

    this.isPolling = true;
    this.shouldStopPolling = false;
    this.logger.log('Starting iLink long-polling loop...');

    void this.pollingLoop();
  }

  /**
   * 长轮询主循环
   */
  private async pollingLoop(): Promise<void> {
    while (!this.shouldStopPolling && this.loggedIn) {
      try {
        const response = await this.ilink.getUpdates(this.updateCursor);

        // 更新游标
        if (response.get_updates_buf) {
          this.updateCursor = response.get_updates_buf;
        }

        // 处理收到的消息
        if (response.msgs && response.msgs.length > 0) {
          this.logger.log(`Received ${response.msgs.length} message(s) from iLink`);

          for (const msg of response.msgs) {
            try {
              await this.handleIncomingMessage(msg);
            } catch (err) {
              this.logger.error(
                `Failed to handle iLink message: ${(err as Error).message}`,
              );
            }
          }
        }

        // 重置同步失败计数
        this.syncFailCount = 0;
      } catch (err) {
        const errMsg = (err as Error).message;

        // 网络超时是正常的（长轮询 35s hold），不算错误
        if (errMsg.includes('timeout') || errMsg.includes('TimeoutError') || errMsg.includes('abort')) {
          this.logger.debug('Long poll timeout (normal), retrying...');
          continue;
        }

        this.syncFailCount++;
        this.logger.warn(
          `iLink poll error (${this.syncFailCount}/${this.maxSyncRetries}): ${errMsg}`,
        );

        if (this.syncFailCount >= this.maxSyncRetries) {
          this.lastError = `iLink 消息接收连续失败 ${this.syncFailCount} 次`;
          this.logger.error('iLink polling failed too many times, triggering reconnect...');
          this.scheduleReconnect();
          break;
        }

        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS));
      }
    }

    this.isPolling = false;
    this.logger.log('iLink polling loop stopped');
  }

  // ============================================================
  // 状态查询
  // ============================================================

  /**
   * 获取当前微信连接状态
   */
  async getStatus(): Promise<WechatStatus> {
    const contactCount = await this.prisma.wechatContact.count({
      where: { status: 'active' },
    });

    return {
      connected: this.phase === 'logged_in',
      loggedIn: this.loggedIn,
      userNickName: this.userNickName,
      qrCodeUrl: this.qrCodeUrl,
      phase: this.phase,
      contactCount,
      lastError: this.lastError,
    };
  }

  /**
   * 获取微信联系人列表
   */
  async getContacts(): Promise<WechatContactDto[]> {
    const contacts = await this.prisma.wechatContact.findMany({
      where: { status: 'active' },
      orderBy: { remarkName: 'asc' },
    });

    return contacts.map((c) => ({
      id: c.userName,
      name: c.remarkName || c.nickName || c.userName,
      remarkName: c.remarkName ?? '',
      avatar: c.avatarUrl ?? '',
      type: c.type as WechatContactDto['type'],
      isStar: c.isStar,
      signature: c.signature ?? '',
    }));
  }

  /**
   * 获取与某联系人的聊天记录
   */
  async getMessages(contactId: string, limit = 50): Promise<WechatMessageDto[]> {
    const messages = await this.prisma.wechatMessage.findMany({
      where: { contactId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return messages.reverse().map((m) => this.toMessageDto(m));
  }

  // ============================================================
  // 消息发送
  // ============================================================

  /**
   * 发送文本消息给微信联系人
   * 使用缓存的 context_token 进行回复
   */
  async sendMessage(toId: string, content: string): Promise<{ success: boolean }> {
    if (!this.loggedIn || !this.botToken) {
      throw new Error('WeChat ClawBot is not logged in');
    }

    // 从缓存获取 context_token
    const contextEntry = this.contextTokenCache.get(toId);
    if (!contextEntry) {
      throw new Error(
        `No context_token for ${toId}. Reply impossible without prior inbound message.`,
      );
    }

    // 检查 token 是否过期
    if (Date.now() - contextEntry.updatedAt > CONTEXT_TOKEN_TTL_MS) {
      this.contextTokenCache.delete(toId);
      throw new Error(`context_token expired for ${toId}, please ask the user to send a new message`);
    }

    // 调用 iLink API 发送消息
    await this.ilink.sendTextMessage(toId, contextEntry.token, content);

    const fromId = this.botId || 'bot';
    const fromName = this.userNickName || 'ClawBot';
    const toName = await this.getContactName(toId);

    const saved = await this.prisma.wechatMessage.create({
      data: {
        contactId: toId,
        fromId,
        fromName,
        toId,
        toName,
        content,
        msgType: 1,
        isSelf: true,
        timestamp: new Date(),
        metadata: { source: 'bot_reply' } as Prisma.InputJsonValue,
      },
    });

    const dto = this.toMessageDto(saved);
    this.messageListeners.forEach((listener) => {
      try {
        listener(dto);
      } catch {
        // ignore
      }
    });

    return { success: true };
  }

  // ============================================================
  // 监听器注册
  // ============================================================

  onMessage(listener: (msg: WechatMessageDto) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  onAgentActivity(listener: (event: AgentActivityEvent) => void): () => void {
    this.agentActivityListeners.push(listener);
    return () => {
      this.agentActivityListeners = this.agentActivityListeners.filter((l) => l !== listener);
    };
  }

  private broadcastAgentActivity(event: AgentActivityEvent): void {
    this.agentActivityListeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // ignore
      }
    });
  }

  // ============================================================
  // 登出 & 生命周期
  // ============================================================

  /**
   * 退出微信登录
   */
  async logout(): Promise<void> {
    this.shouldStopPolling = true;
    this.isReconnecting = true;

    // 等待轮询循环停止
    if (this.isPolling) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.loggedIn = false;
    this.phase = 'logged_out';
    this.qrCodeUrl = null;
    this.userNickName = null;
    this.botToken = null;
    this.botId = null;
    this.updateCursor = '';
    this.contextTokenCache.clear();
    this.typingTicketCache.clear();
    this.syncFailCount = 0;
    this.reconnectStartedAt = null;
    this.isReconnecting = false;
    this.logger.log('WeChat ClawBot logged out (manual)');
  }

  /**
   * 模块销毁时清理
   */
  onModuleDestroy() {
    this.shouldStopPolling = true;
  }

  // ============================================================
  // 家庭成员绑定
  // ============================================================

  async bindFamilyMember(payload: BindFamilyMemberPayload): Promise<void> {
    const member = await this.prisma.familyMember.findUnique({
      where: { id: payload.familyMemberId },
      select: { id: true },
    });

    if (!member) {
      throw new Error('家庭成员不存在');
    }

    await this.prisma.familyMember.update({
      where: { id: payload.familyMemberId },
      data: {
        wechatId: payload.wechatId ?? null,
        wechatNickname: payload.wechatNickname ?? null,
        wechatAlias: payload.wechatAlias ?? null,
      },
    });

    this.logger.log(
      `Bound WeChat identity to family member ${payload.familyMemberId}: ${payload.wechatId ?? payload.wechatNickname ?? ''}`,
    );
  }

  // ============================================================
  // Agent pipeline 集成
  // ============================================================

  /**
   * 通过微信 ID / 昵称解析绑定的家庭成员
   */
  private async resolveFamilyMember(
    wechatId: string,
    nickName: string,
  ): Promise<{ id: string; userId: string; familyId: string } | null> {
    if (!wechatId && !nickName) return null;

    const member = await this.prisma.familyMember.findFirst({
      where: {
        OR: [
          { wechatId: wechatId || undefined },
          { wechatNickname: nickName || undefined },
          { wechatAlias: wechatId || undefined },
        ],
      },
      select: { id: true, userId: true, familyId: true },
    });

    return member;
  }

  /**
   * 将消息送入 AgentRuntime pipeline 并返回回复文本
   * 同时将 agent 产生的 SSE 事件广播给前端
   */
  private async runAgentPipeline(
    userId: string,
    message: string,
    contactId: string,
    senderName: string,
  ): Promise<string> {
    let reply = '';
    this.activeAgentCount++;

    try {
      for await (const event of this.agentRuntime.run({
        userId,
        message,
        mode: 'wechat',
      })) {
        switch (event.type) {
          case SSEEventType.TOKEN:
            reply += event.data.content;
            this.broadcastAgentActivity({
              type: 'token',
              contactId,
              senderName,
              content: event.data.content,
              timestamp: Date.now(),
            });
            break;
          case SSEEventType.REASONING:
            this.broadcastAgentActivity({
              type: 'thinking',
              contactId,
              senderName,
              content: event.data.content,
              timestamp: Date.now(),
            });
            break;
          case SSEEventType.TOOL_CALL:
            this.broadcastAgentActivity({
              type: 'tool_call',
              contactId,
              senderName,
              toolName: event.data.tool,
              content: JSON.stringify(event.data.args),
              timestamp: Date.now(),
            });
            break;
          case SSEEventType.OBSERVATION:
            this.broadcastAgentActivity({
              type: 'observation',
              contactId,
              senderName,
              content: event.data.summary,
              timestamp: Date.now(),
            });
            break;
          case SSEEventType.DONE:
            this.broadcastAgentActivity({
              type: 'done',
              contactId,
              senderName,
              content: event.data.summary,
              timestamp: Date.now(),
            });
            break;
          case SSEEventType.ERROR:
            this.broadcastAgentActivity({
              type: 'error',
              contactId,
              senderName,
              content: event.data.message,
              timestamp: Date.now(),
            });
            break;
          default:
            break;
        }
      }
    } catch (error) {
      this.logger.error(`Agent pipeline failed: ${(error as Error).message}`);
      reply = '抱歉，我刚才走神了，能再说一遍吗？';
      this.broadcastAgentActivity({
        type: 'error',
        contactId,
        senderName,
        content: (error as Error).message,
        timestamp: Date.now(),
      });
    } finally {
      this.activeAgentCount--;
    }

    return reply.trim();
  }

  /**
   * 发送"正在输入"状态给微信用户
   * iLink 协议要求：先调 getConfig 获取 typing_ticket，再调 sendTyping
   * typing_ticket 会缓存 30 分钟，避免每次都请求 getConfig
   */
  private async sendTypingIndicator(userId: string, contextToken: string): Promise<void> {
    if (!contextToken || !this.botUserId) return;

    try {
      // 检查缓存中是否有有效的 typing_ticket
      let ticketEntry = this.typingTicketCache.get(userId);
      const now = Date.now();

      if (!ticketEntry || now - ticketEntry.updatedAt > CONTEXT_TOKEN_TTL_MS) {
        // 需要重新获取 typing_ticket
        const config = await this.ilink.getConfig(userId, contextToken);
        if (config.typing_ticket) {
          ticketEntry = {
            ticket: config.typing_ticket,
            contextToken,
            updatedAt: now,
          };
          this.typingTicketCache.set(userId, ticketEntry);
        } else {
          this.logger.debug(`No typing_ticket returned from getConfig for ${userId}`);
          return;
        }
      }

      // 发送"正在输入"状态 (status=1)
      await this.ilink.sendTyping(userId, ticketEntry.ticket, true);
    } catch (err) {
      // typing 状态失败不影响主流程
      this.logger.debug(`sendTypingIndicator failed (non-critical): ${(err as Error).message}`);
    }
  }

  /**
   * 取消"正在输入"状态（回复发送后调用）
   */
  private async cancelTypingIndicator(userId: string): Promise<void> {
    const ticketEntry = this.typingTicketCache.get(userId);
    if (!ticketEntry) return;

    try {
      await this.ilink.sendTyping(userId, ticketEntry.ticket, false);
    } catch {
      // ignore
    }
  }

  // ============================================================
  // 消息持久化 & 记忆
  // ============================================================

  private async persistChatAsMemory(
    member: { id: string; userId: string; familyId: string },
    content: string,
    messageId: string,
    contactId: string,
    senderName: string,
    isGroup: boolean,
    occurredAt: Date,
  ): Promise<void> {
    if (!content || content.trim().length === 0) return;

    try {
      const title = content.length <= 40 ? content : `${content.slice(0, 37)}...`;
      const memory = await this.memoryService.create(member.userId, {
        title: `微信${isGroup ? '家庭群聊' : '私聊'}：${title}`,
        content,
        type: MemoryType.DAILY,
        visibility: isGroup ? MemoryVisibility.FAMILY : MemoryVisibility.PRIVATE,
        importance: 0.6,
        occurredAt,
        metadata: {
          source: 'wechat',
          messageId,
          contactId,
          senderName,
          familyMemberId: member.id,
          isGroup,
        },
      });

      if (isGroup) {
        try {
          await this.prisma.familyMemory.create({
            data: {
              familyId: member.familyId,
              memoryId: memory.id,
              contributorId: member.userId,
            },
          });
        } catch (err) {
          this.logger.warn(`Failed to create family memory link: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to persist WeChat message to memory: ${(err as Error).message}`);
    }
  }

  // ============================================================
  // 主动服务
  // ============================================================

  private async handleProactiveActions(
    message: string,
    reply: string,
    userId: string,
    contactId: string,
    fromName: string,
  ): Promise<void> {
    const text = message.trim();

    if (/提醒我|待办|别忘了|记住这件事/.test(text)) {
      try {
        const reminder = await this.memoryService.create(userId, {
          title: `微信提醒：${text.slice(0, 40)}`,
          content: text,
          type: MemoryType.DAILY,
          visibility: MemoryVisibility.PRIVATE,
          importance: 0.7,
          metadata: { source: 'wechat', kind: 'reminder' },
        } as CreateMemoryDto);

        await this.notifyUser(userId, '微信提醒已记录', `已为你记录提醒：${reminder.title}`);
      } catch (err) {
        this.logger.warn(`WeChat proactive reminder failed: ${(err as Error).message}`);
      }
    }

    if (/总结一下|生成总结|周报|月报|日报|年报/.test(text)) {
      try {
        await this.createProactiveSummary(userId, text);
      } catch (err) {
        this.logger.warn(`WeChat proactive summary failed: ${(err as Error).message}`);
      }
    }

    if (/时间胶囊|封存|留给未来|写给.*年后的自己/.test(text)) {
      try {
        await this.createProactiveCapsule(userId, text, fromName);
      } catch (err) {
        this.logger.warn(`WeChat proactive capsule failed: ${(err as Error).message}`);
      }
    }
  }

  private async createProactiveSummary(userId: string, text: string): Promise<void> {
    let period = SummaryPeriod.WEEKLY;
    if (/日报|每日|今天/.test(text)) period = SummaryPeriod.DAILY;
    else if (/月报|每月|这个月/.test(text)) period = SummaryPeriod.MONTHLY;
    else if (/年报|每年|今年/.test(text)) period = SummaryPeriod.YEARLY;

    const startDate = this.computeSummaryStartDate(period);

    const summary = await this.summaryService.generate(userId, {
      period,
      startDate,
    } as GenerateSummaryDto);

    await this.notifyUser(
      userId,
      `${this.getPeriodLabel(period)}总结已生成`,
      `已为你生成${this.getPeriodLabel(period)}总结：${summary.title}`,
      { summaryId: summary.id, period },
    );
  }

  private computeSummaryStartDate(period: SummaryPeriod): Date {
    const now = new Date();
    switch (period) {
      case SummaryPeriod.DAILY:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case SummaryPeriod.WEEKLY:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case SummaryPeriod.MONTHLY:
        return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case SummaryPeriod.YEARLY:
        return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  private getPeriodLabel(period: SummaryPeriod): string {
    const labels: Record<string, string> = {
      [SummaryPeriod.DAILY]: '每日',
      [SummaryPeriod.WEEKLY]: '每周',
      [SummaryPeriod.MONTHLY]: '每月',
      [SummaryPeriod.YEARLY]: '每年',
    };
    return labels[period] ?? '周期';
  }

  private async createProactiveCapsule(userId: string, text: string, fromName: string): Promise<void> {
    const openAt = this.extractCapsuleOpenAt(text) ?? this.addYears(new Date(), 1);
    const title = text.length <= 40 ? text : `${text.slice(0, 37)}...`;

    const capsule = await this.capsuleService.create(userId, {
      title: `来自微信的时间胶囊：${title}`,
      content: text,
      type: CapsuleType.PERSONAL,
      openAt,
      metadata: { source: 'wechat', senderName: fromName },
    } as CreateCapsuleDto);

    await this.notifyUser(
      userId,
      '时间胶囊已封存',
      `已为你封存一条时间胶囊，将于 ${openAt.toISOString().split('T')[0]} 开启。`,
      { capsuleId: capsule.id },
    );
  }

  private extractCapsuleOpenAt(text: string): Date | null {
    const patterns = [
      { regex: /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日]?/, build: (m: RegExpMatchArray) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) },
      { regex: /(\d{1,2})[月/-](\d{1,2})[日]?/, build: (m: RegExpMatchArray) => {
        const now = new Date();
        return new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
      }},
    ];

    for (const p of patterns) {
      const match = text.match(p.regex);
      if (match) {
        const date = p.build(match);
        if (!isNaN(date.getTime()) && date > new Date()) {
          return date;
        }
      }
    }

    return null;
  }

  private addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  private async notifyUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const payload: CreateNotificationPayload = {
        userId,
        type: 'wechat_proactive',
        title,
        body,
        data,
      };
      await this.notificationService.create(payload);
    } catch (err) {
      this.logger.warn(`Failed to create proactive notification: ${(err as Error).message}`);
    }
  }

  // ============================================================
  // 消息处理（iLink → Agent pipeline）
  // ============================================================

  /**
   * 处理收到的 iLink 消息
   * 1. 缓存 context_token（用于后续回复）
   * 2. 持久化到数据库
   * 3. 识别家庭成员
   * 4. 送入 AgentRuntime pipeline
   * 5. 回复用户
   * 6. 触发主动服务
   */
  private async handleIncomingMessage(msg: ILinkInboundMessage): Promise<void> {
    // 提取文本内容
    const content = ILinkClient.extractText(msg);
    const itemType = ILinkClient.getItemType(msg); // 1=TEXT, 2=IMAGE...
    const fromId = msg.from_user_id ?? '';
    const toId = msg.to_user_id ?? '';

    // message_type: 1=USER, 2=BOT（是发送者类型，不是内容类型！）
    const isBot = ILinkClient.isBotMessage(msg);
    const isSelf = isBot; // Bot 自己发的消息

    // 只处理文本和图片
    if (itemType !== 1 && itemType !== 2) return;

    const displayContent = itemType === 2 ? '[图片]' : content;
    if (!displayContent.trim()) return;

    // ilink 只支持 direct chat，对话另一方就是发送者
    const otherId = fromId;
    const senderName = fromId;

    // ⚠️ 关键：缓存 context_token，后续回复必须带上
    const contextToken = msg.context_token ?? '';
    if (contextToken) {
      this.contextTokenCache.set(otherId, {
        token: contextToken,
        updatedAt: Date.now(),
      });
      this.logger.debug(`Cached context_token for ${otherId}`);
    }

    // 持久化消息
    const msgTimestamp = msg.create_time_ms ?? Date.now();
    const saved = await this.prisma.wechatMessage.create({
      data: {
        contactId: otherId,
        fromId,
        fromName: senderName,
        toId,
        toName: isSelf ? this.userNickName || 'Bot' : 'Bot',
        content: displayContent,
        msgType: itemType,
        isSelf,
        senderWechatId: null,
        timestamp: new Date(msgTimestamp),
        metadata: {
          rawMsgId: msg.message_id,
          contextToken,
          source: 'ilink',
        } as Prisma.InputJsonValue,
      },
    });

    const dto = this.toMessageDto(saved);

    // 通知 SSE 监听器
    this.messageListeners.forEach((listener) => {
      try {
        listener(dto);
      } catch {
        // ignore
      }
    });

    this.logger.debug(
      `iLink message from ${senderName}: ${displayContent.substring(0, 50)}`,
    );

    // 不回复自己发的消息
    if (isSelf) return;

    // 同步联系人信息到数据库
    await this.syncContactFromMessage(otherId, senderName, false);

    // 识别家庭成员
    const member = await this.resolveFamilyMember(fromId, senderName);

    if (!member) {
      this.logger.debug(`No family member binding for WeChat identity ${fromId}`);
      return;
    }

    // 标记消息关联的家庭成员
    await this.prisma.wechatMessage.update({
      where: { id: saved.id },
      data: { familyMemberId: member.id },
    });

    // 持久化到长期记忆
    await this.persistChatAsMemory(
      member,
      displayContent,
      saved.id,
      otherId,
      senderName,
      false,
      new Date(msgTimestamp),
    );

    // 送入 AgentRuntime pipeline
    this.pendingMessages++;

    // 广播 thinking 事件
    this.broadcastAgentActivity({
      type: 'thinking',
      contactId: otherId,
      senderName,
      content: '正在思考你的消息...',
      timestamp: Date.now(),
    });

    // 发送"正在输入"状态（需先通过 getConfig 获取 typing_ticket）
    await this.sendTypingIndicator(otherId, contextToken);

    try {
      const reply = await this.runAgentPipeline(
        member.userId,
        displayContent,
        otherId,
        senderName,
      );

      // 广播 done 事件
      this.broadcastAgentActivity({
        type: 'done',
        contactId: otherId,
        senderName,
        content: reply,
        timestamp: Date.now(),
      });

      // 回复用户
      if (reply) {
        try {
          await this.sendMessage(otherId, reply);
          // 取消"正在输入"状态
          await this.cancelTypingIndicator(otherId);
        } catch (err) {
          this.logger.error(`Failed to send iLink reply: ${(err as Error).message}`);
        }
      }

      // 触发主动服务
      await this.handleProactiveActions(displayContent, reply, member.userId, otherId, senderName);
    } finally {
      this.pendingMessages--;
    }
  }

  // ============================================================
  // 联系人管理
  // ============================================================

  /**
   * 从收到的消息中同步联系人信息
   * iLink API 没有 getContacts 接口，联系人通过消息积累
   */
  private async syncContactFromMessage(
    userId: string,
    nickname: string,
    isGroup: boolean,
  ): Promise<void> {
    if (!nickname || !userId) return;

    try {
      await this.prisma.wechatContact.upsert({
        where: { userName: userId },
        update: {
          nickName: nickname,
          type: isGroup ? 'group' : 'friend',
          status: 'active',
        },
        create: {
          userName: userId,
          nickName: nickname,
          remarkName: '',
          type: isGroup ? 'group' : 'friend',
          isStar: false,
          signature: '',
          status: 'active',
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to sync contact from message: ${(err as Error).message}`);
    }
  }

  private async getContactName(id: string): Promise<string> {
    const contact = await this.prisma.wechatContact.findUnique({
      where: { userName: id },
      select: { remarkName: true, nickName: true },
    });

    if (contact) {
      return contact.remarkName || contact.nickName || id;
    }
    return id;
  }

  private toMessageDto(m: {
    id: string;
    contactId: string;
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    content: string;
    msgType: number;
    isSelf: boolean;
    timestamp: Date;
    senderWechatId: string | null;
  }): WechatMessageDto {
    return {
      id: m.id,
      contactId: m.contactId,
      fromId: m.fromId,
      fromName: m.fromName,
      toId: m.toId,
      toName: m.toName,
      content: m.content,
      timestamp: m.timestamp.getTime(),
      isSelf: m.isSelf,
      type: m.msgType === 1 ? 'text' : m.msgType === 2 ? 'image' : 'other',
      senderWechatId: m.senderWechatId ?? undefined,
    };
  }

  // ============================================================
  // 自动重连
  // ============================================================

  /**
   * 自动重连：重新走扫码登录流程
   * - 限制最大重连时间窗口
   * - 超过窗口则放弃并标记 phase = 'error'
   */
  private async scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    if (!this.reconnectStartedAt) {
      this.reconnectStartedAt = Date.now();
    }
    const elapsed = Date.now() - this.reconnectStartedAt;
    if (elapsed > this.maxReconnectWindowMs) {
      this.isReconnecting = false;
      this.phase = 'error';
      this.lastError = '重连超时，已停止自动重连，请手动重新登录；AI 管家可正常使用';
      this.reconnectStartedAt = null;
      this.logger.error(
        `iLink 重连时间窗口（${this.maxReconnectWindowMs / 1000}s）已超，放弃自动重连。`,
      );
      return;
    }

    const attempt = this.syncFailCount + 1;
    const delay = Math.min(3000 * Math.pow(2, this.syncFailCount), 60000);
    this.logger.log(
      `iLink 重连计划：第 ${attempt} 次尝试，${delay / 1000}s 后执行（累计耗时 ${Math.round(elapsed / 1000)}s）`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    this.syncFailCount++;

    try {
      this.logger.log('iLink 重连：停止旧轮询，重新发起登录流程...');

      // 停止旧轮询
      this.shouldStopPolling = true;
      if (this.isPolling) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // 清理登录态
      this.loggedIn = false;
      this.qrCodeUrl = null;
      this.lastError = '正在重连微信，请稍候...';
      this.updateCursor = '';

      // 如果有 bot_token，尝试直接恢复
      if (this.botToken) {
        this.logger.log('iLink 重连：尝试用已有 token 恢复...');
        this.ilink.setBotToken(this.botToken);
        this.loggedIn = true;
        this.phase = 'logged_in';
        this.isReconnecting = false;
        this.reconnectStartedAt = null;
        this.startPollingLoop();
        this.logger.log('iLink 重连：已用已有 token 恢复轮询');
        return;
      }

      // 没有 token，需要重新扫码
      this.logger.log('iLink 重连：发起新的扫码登录流程...');
      await this.startLogin();
      this.reconnectStartedAt = null;
      this.isReconnecting = false;
    } catch (err) {
      const errMsg = (err as Error).message;
      this.logger.error(`iLink 重连失败：${errMsg}`);
      this.lastError = `重连失败：${errMsg}`;

      const stillWithinWindow =
        Date.now() - (this.reconnectStartedAt ?? Date.now()) < this.maxReconnectWindowMs;
      if (stillWithinWindow && this.syncFailCount < this.maxSyncRetries + 3) {
        this.logger.log('iLink 将继续尝试重连...');
        this.isReconnecting = false;
        void this.scheduleReconnect();
        return;
      }

      this.isReconnecting = false;
      this.phase = 'error';
      this.reconnectStartedAt = null;
      this.lastError = '重连次数/时间已达上限，请手动重新登录；AI 管家可正常使用';
      this.logger.error('iLink 重连次数/时间已达上限，需要手动重新登录。');
    }
  }

  // ============================================================
  // 健康检查
  // ============================================================

  async healthCheck(): Promise<{
    healthy: boolean;
    phase: string;
    canRetry: boolean;
    suggestion: string;
    agentActive: boolean;
    pendingMessages: number;
  }> {
    const phase = this.phase;
    const loggedIn = this.loggedIn;
    const hasSyncIssue =
      loggedIn &&
      !!this.lastError &&
      this.lastError.includes('失败');

    const healthy = loggedIn && phase === 'logged_in' && !hasSyncIssue;
    const canRetry = !this.isReconnecting && phase !== 'error';
    const agentActive = this.activeAgentCount > 0;
    const pendingMessages = this.pendingMessages;

    let suggestion: string;
    if (healthy) {
      suggestion = '微信 ClawBot 连接正常';
    } else if (hasSyncIssue) {
      suggestion = '消息接收异常，后端正在自动重连，AI 管家可正常使用（降级模式）';
    } else if (phase === 'error') {
      suggestion = '微信连接异常，请手动重新扫码登录；AI 管家不受影响';
    } else if (phase === 'waiting_scan' || phase === 'waiting_confirm') {
      suggestion = '请使用手机微信扫码确认登录';
    } else if (this.isReconnecting) {
      suggestion = '正在自动重连中，请稍候';
    } else {
      suggestion = '微信未连接，可扫码登录；AI 管家始终可用';
    }

    if (agentActive) {
      suggestion += `；当前有 agent 正在处理 ${pendingMessages} 条消息`;
    }

    return { healthy, phase, canRetry, suggestion, agentActive, pendingMessages };
  }
}
