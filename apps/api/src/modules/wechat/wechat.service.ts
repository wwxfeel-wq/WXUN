import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Wechat4u, { Wechat4uContact, Wechat4uMessage } from 'wechat4u';
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
 * WechatService - Manages a real WeChat web connection via wechat4u.
 *
 * Phase 7 refactor:
 *  - Incoming messages flow into the AgentRuntime pipeline (时墨).
 *  - Family members are identified by WeChat id / nickname bound to FamilyMember.
 *  - Messages and contacts are persisted in PostgreSQL / Redis instead of memory.
 *  - Proactive services (reminders, summaries, time capsules) are triggered
 *    from WeChat content when appropriate.
 */
@Injectable()
export class WechatService implements OnModuleDestroy {
  private readonly logger = new Logger(WechatService.name);
  private bot: Wechat4u | null = null;

  private qrCodeUrl: string | null = null;
  private loggedIn = false;
  private userNickName: string | null = null;
  private phase: WechatStatus['phase'] = 'idle';
  private lastError: string | null = null;

  /** Auto-reconnect state */
  private syncFailCount = 0;
  private maxSyncRetries = 5;
  private reconnectDelay = 5000;
  private isReconnecting = false;
  private botData: any = null;

  /** Callbacks for incoming messages (used by controller for SSE push) */
  private messageListeners: Array<(msg: WechatMessageDto) => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly agentRuntime: AgentRuntimeService,
    private readonly memoryService: MemoryService,
    private readonly summaryService: SummaryService,
    private readonly capsuleService: CapsuleService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Start the WeChat login process. Generates a QR code URL.
   */
  async startLogin(): Promise<{ qrCodeUrl: string }> {
    if (this.loggedIn && this.bot) {
      return { qrCodeUrl: '' };
    }

    if (this.bot) {
      try {
        this.bot.logout();
      } catch {
        // ignore
      }
      this.bot = null;
    }

    this.phase = 'idle';
    this.qrCodeUrl = null;
    this.lastError = null;

    this.bot = new Wechat4u();

    this.bot.on('uuid', (uuid: string) => {
      this.qrCodeUrl = `https://login.weixin.qq.com/qrcode/${uuid}`;
      this.phase = 'waiting_scan';
      this.logger.log('WeChat QR code generated, waiting for scan...');
    });

    this.bot.on('scan', () => {
      this.phase = 'waiting_scan';
      this.logger.log('WeChat QR code scanned, waiting for confirm...');
    });

    this.bot.on('confirm', () => {
      this.phase = 'waiting_confirm';
      this.logger.log('WeChat login confirmed, connecting...');
    });

    this.bot.on('login', async () => {
      this.loggedIn = true;
      this.phase = 'logged_in';
      this.syncFailCount = 0;
      this.userNickName = this.bot?.user?.NickName || 'Unknown';
      this.logger.log(`WeChat logged in: ${this.userNickName}`);

      try {
        this.botData = this.bot?.botData;
      } catch {
        // ignore
      }

      try {
        await this.bot?.updateContacts();
        await this.syncContactsToDb();
      } catch (err) {
        this.logger.warn(`Failed to fetch/sync contacts: ${(err as Error).message}`);
      }
    });

    this.bot.on('contacts-updated', async () => {
      if (this.loggedIn) {
        try {
          await this.syncContactsToDb();
          this.logger.debug('WeChat contacts synchronized to database');
        } catch (err) {
          this.logger.warn(`Failed to sync contacts: ${(err as Error).message}`);
        }
      }
    });

    this.bot.on('logout', () => {
      const wasLoggedIn = this.loggedIn;
      this.loggedIn = false;
      this.phase = 'logged_out';
      this.qrCodeUrl = null;
      this.userNickName = null;
      this.logger.log('WeChat logged out');

      if (wasLoggedIn && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    this.bot.on('message', (msg: Wechat4uMessage) => {
      this.handleIncomingMessage(msg).catch((err) => {
        this.logger.error(`Failed to handle WeChat message: ${(err as Error).message}`);
      });
    });

    this.bot.on('error', (err: Error) => {
      const errMsg = err.message || '';
      this.logger.error(`WeChat error: ${errMsg}`);

      if (errMsg.includes('1102') || errMsg.includes('同步失败')) {
        this.syncFailCount++;
        this.lastError = `同步中断 (${this.syncFailCount}/${this.maxSyncRetries})，正在自动重连...`;
        if (this.syncFailCount >= this.maxSyncRetries && !this.isReconnecting) {
          this.logger.warn(`Max sync retries (${this.maxSyncRetries}) reached`);
        }
      } else if (!this.loggedIn) {
        this.lastError = errMsg;
        this.phase = 'error';
      } else {
        this.logger.warn(`Non-fatal WeChat error after login: ${errMsg}`);
        this.lastError = errMsg;
      }
    });

    this.bot.start();

    const maxWait = 15000;
    const interval = 200;
    const startTime = Date.now();
    while (!this.qrCodeUrl && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    if (!this.qrCodeUrl) {
      throw new Error('Failed to generate WeChat QR code. Please try again.');
    }

    return { qrCodeUrl: this.qrCodeUrl };
  }

  /**
   * Get current WeChat connection status.
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
   * Get the WeChat contacts list.
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
   * Get messages for a specific contact.
   */
  async getMessages(contactId: string, limit = 50): Promise<WechatMessageDto[]> {
    const messages = await this.prisma.wechatMessage.findMany({
      where: { contactId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return messages.reverse().map((m) => this.toMessageDto(m));
  }

  /**
   * Send a text message to a WeChat contact.
   */
  async sendMessage(toId: string, content: string): Promise<{ success: boolean }> {
    if (!this.loggedIn || !this.bot) {
      throw new Error('WeChat is not logged in');
    }

    await this.bot.sendMsg(content, toId);

    const fromId = this.bot.user?.UserName || 'self';
    const fromName = this.userNickName || 'Me';
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
        // ignore listener errors
      }
    });

    return { success: true };
  }

  /**
   * Register a listener for incoming messages (used for SSE push).
   */
  onMessage(listener: (msg: WechatMessageDto) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Logout from WeChat.
   */
  async logout(): Promise<void> {
    this.isReconnecting = true;

    if (this.bot) {
      try {
        this.bot.logout();
      } catch {
        // ignore
      }
    }

    this.loggedIn = false;
    this.phase = 'logged_out';
    this.qrCodeUrl = null;
    this.userNickName = null;
    this.syncFailCount = 0;
    this.botData = null;
    this.isReconnecting = false;
    this.logger.log('WeChat logged out (manual)');
  }

  /**
   * Bind a WeChat identity to a family member.
   */
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

  /**
   * Clean up on module destroy.
   */
  onModuleDestroy() {
    if (this.bot) {
      try {
        this.bot.logout();
      } catch {
        // ignore
      }
    }
  }

  // ============================================================
  // Agent pipeline integration
  // ============================================================

  /**
   * Resolve the bound family member from a WeChat identity.
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
   * Run a single message through the AgentRuntime pipeline and return the reply text.
   */
  private async runAgentPipeline(userId: string, message: string): Promise<string> {
    let reply = '';

    try {
      for await (const event of this.agentRuntime.run({
        userId,
        message,
        mode: 'chat',
      })) {
        if (event.type === SSEEventType.TOKEN) {
          reply += event.data.content;
        }
      }
    } catch (error) {
      this.logger.error(`Agent pipeline failed: ${(error as Error).message}`);
      reply = '抱歉，我刚才走神了，能再说一遍吗？';
    }

    return reply.trim();
  }

  /**
   * Persist an incoming family/private WeChat message as a long-term memory.
   * Family group messages are stored with family visibility and linked to the
   * family memory pool.
   */
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

      // Link group messages to the shared family memory pool
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
  // Proactive services
  // ============================================================

  /**
   * Detect proactive intents in a WeChat message and trigger side effects.
   */
  private async handleProactiveActions(
    message: string,
    reply: string,
    userId: string,
    contactId: string,
    fromName: string,
  ): Promise<void> {
    const text = message.trim();

    // Reminder / todo
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

    // Summary request
    if (/总结一下|生成总结|周报|月报|日报|年报/.test(text)) {
      try {
        await this.createProactiveSummary(userId, text);
      } catch (err) {
        this.logger.warn(`WeChat proactive summary failed: ${(err as Error).message}`);
      }
    }

    // Time capsule request
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
  // Message & contact persistence
  // ============================================================

  private async handleIncomingMessage(msg: Wechat4uMessage): Promise<void> {
    if (!this.bot) return;

    const fromId = msg.FromUserName;
    const toId = msg.ToUserName;
    const isSelf = fromId === this.bot.user?.UserName;
    const isGroup = fromId.startsWith('@@');

    let content = msg.Content;
    let senderName = this.getContactName(fromId);
    let senderWechatId: string | undefined;

    // Group messages: "senderId:\ncontent"
    if (isGroup && content.includes(':\n')) {
      const colonIdx = content.indexOf(':\n');
      senderWechatId = content.substring(0, colonIdx);
      content = content.substring(colonIdx + 2);
      senderName = this.getContactName(senderWechatId) || senderName;
    }

    // Only process text / image messages
    if (msg.MsgType !== 1 && msg.MsgType !== 3) return;

    const displayContent = msg.MsgType === 3 ? '[图片]' : content;
    const otherId = isSelf ? toId : fromId;

    const saved = await this.prisma.wechatMessage.create({
      data: {
        contactId: otherId,
        fromId,
        fromName: senderName,
        toId,
        toName: isSelf ? this.getContactName(toId) : this.userNickName || 'Me',
        content: displayContent,
        msgType: msg.MsgType,
        isSelf,
        senderWechatId,
        timestamp: new Date(msg.CreateTime * 1000),
        metadata: { rawMsgId: msg.MsgId } as Prisma.InputJsonValue,
      },
    });

    const dto = this.toMessageDto(saved);

    // Notify SSE listeners
    this.messageListeners.forEach((listener) => {
      try {
        listener(dto);
      } catch {
        // ignore
      }
    });

    this.logger.debug(`WeChat message from ${senderName}: ${displayContent.substring(0, 50)}`);

    // Do not reply to our own messages
    if (isSelf) return;

    // Identify family member from the sender
    const lookupId = senderWechatId || fromId;
    const member = await this.resolveFamilyMember(lookupId, senderName);

    if (!member) {
      this.logger.debug(`No family member binding for WeChat identity ${lookupId}`);
      return;
    }

    // Mark the message with the identified family member
    await this.prisma.wechatMessage.update({
      where: { id: saved.id },
      data: { familyMemberId: member.id },
    });

    // Persist the family/private chat message into long-term Memory
    await this.persistChatAsMemory(
      member,
      displayContent,
      saved.id,
      otherId,
      senderName,
      isGroup,
      new Date(msg.CreateTime * 1000),
    );

    // Run the message through the AgentRuntime pipeline
    const reply = await this.runAgentPipeline(member.userId, displayContent);

    if (reply) {
      try {
        await this.sendMessage(otherId, reply);
      } catch (err) {
        this.logger.error(`Failed to send WeChat reply: ${(err as Error).message}`);
      }
    }

    // Trigger proactive services based on message content
    await this.handleProactiveActions(displayContent, reply, member.userId, otherId, senderName);
  }

  private async syncContactsToDb(): Promise<void> {
    if (!this.bot?.contacts) return;

    const contacts = Object.values(this.bot.contacts).filter((c) => {
      if (!c.NickName && !c.RemarkName) return false;
      if (c.UserName.startsWith('fmessage')) return false;
      if (c.UserName === 'filehelper') return false;
      return true;
    });

    for (const c of contacts) {
      const type = this.getContactType(c);
      await this.prisma.wechatContact.upsert({
        where: { userName: c.UserName },
        update: {
          nickName: c.NickName,
          remarkName: c.RemarkName,
          alias: c.Alias,
          type,
          isStar: c.StarFriend === 1,
          signature: c.Signature || '',
          status: 'active',
        },
        create: {
          userName: c.UserName,
          nickName: c.NickName,
          remarkName: c.RemarkName,
          alias: c.Alias,
          type,
          isStar: c.StarFriend === 1,
          signature: c.Signature || '',
          status: 'active',
        },
      });
    }

    // Soft-delete contacts that no longer appear in the bot list
    const activeUserNames = contacts.map((c) => c.UserName);
    if (activeUserNames.length > 0) {
      await this.prisma.wechatContact.updateMany({
        where: { userName: { notIn: activeUserNames }, status: 'active' },
        data: { status: 'inactive' },
      });
    }
  }

  private getContactType(c: Wechat4uContact): WechatContactDto['type'] {
    if (c.UserName.startsWith('@@')) return 'group';
    if (c.VerifyFlag & 8) return 'official';
    if (c.UserName.startsWith('gh_')) return 'official';
    if (c.Special) return 'special';
    return 'friend';
  }

  private getContactName(id: string): string {
    if (!this.bot?.contacts) return id;
    const c = this.bot.contacts[id];
    if (!c) return id;
    return c.RemarkName || c.NickName || c.Alias || id;
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
      type: m.msgType === 1 ? 'text' : m.msgType === 3 ? 'image' : 'other',
      senderWechatId: m.senderWechatId ?? undefined,
    };
  }

  private async scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.syncFailCount), 60000);
    this.logger.log(`Scheduling WeChat reconnect in ${delay / 1000}s...`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    this.isReconnecting = false;
    this.syncFailCount++;

    try {
      if (this.bot) {
        try {
          this.bot.restart();
          this.logger.log('WeChat restart initiated');
          return;
        } catch (err) {
          this.logger.warn(`WeChat restart failed: ${(err as Error).message}`);
        }
      }

      this.bot = null;
      this.phase = 'idle';
      this.lastError = null;
      await this.startLogin();
      this.logger.log('WeChat fresh login initiated after reconnect failure');
    } catch (err) {
      this.logger.error(`WeChat reconnect failed: ${(err as Error).message}`);
      this.lastError = `重连失败: ${(err as Error).message}`;

      if (this.syncFailCount < this.maxSyncRetries + 3) {
        this.scheduleReconnect();
      } else {
        this.phase = 'error';
        this.logger.error('Max reconnect attempts reached. WeChat requires manual re-login.');
      }
    }
  }
}
