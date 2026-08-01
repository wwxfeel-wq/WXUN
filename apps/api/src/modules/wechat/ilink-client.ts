/**
 * iLink Bot API Client
 * ─────────────────────────────────────
 * 微信官方 ClawBot iLink 协议 HTTP 客户端
 *
 * 接入域名: https://ilinkai.weixin.qq.com
 * 协议版本: 1.0.3 (对齐 @tencent-weixin/openclaw-weixin@2.4.6)
 *
 * 核心能力:
 *  - 扫码登录 (GET get_bot_qrcode + GET get_qrcode_status)
 *  - 长轮询收消息 (POST getupdates, 35s hold)
 *  - 发送消息 (POST sendmessage, 必须带 client_id + context_token + base_info)
 *  - 流式回复 (message_state: GENERATING → FINISH, 复用同一 client_id)
 *  - 获取配置 (POST getconfig → typing_ticket)
 *  - 发送"正在输入"状态 (POST sendtyping, 需要 typing_ticket)
 *  - CDN 媒体上传 (POST getuploadurl)
 *
 * ⚠️ 关键协议细节（缺失会导致消息被静默丢弃）:
 *  1. sendMessage 必须带 from_user_id(""), client_id(UUID), message_type(2), message_state(2)
 *  2. 所有 POST 请求体顶层必须带 base_info: { channel_version: "1.0.3" }
 *  3. context_token 从 getUpdates 的消息体中获取，可无限复用
 *  4. sendTyping 需要先调 getConfig 获取 typing_ticket
 *
 * @see https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin
 */

import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ILinkQrCodeResponse,
  ILinkQrCodeStatusResponse,
  ILinkGetUpdatesResponse,
  ILinkSendMessageResponse,
  ILinkGetConfigResponse,
  ILinkGetUploadUrlResponse,
  ILinkInboundMessage,
  ILinkMessageItem,
  ILinkMessageType,
  ILinkMessageState,
  ILinkItemType,
} from './ilink.types';

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '1.0.3';

/** 长轮询超时（服务器 hold 最多 35s，加 10s 网络余量） */
const POLL_TIMEOUT_MS = 45_000;

/** 普通 API 请求超时 */
const API_TIMEOUT_MS = 15_000;

/** 会话超时错误码 */
const SESSION_TIMEOUT_ERRCODE = -14;

export class ILinkClient {
  private readonly logger = new Logger(ILinkClient.name);
  private botToken: string | null = null;

  /** 设置登录后获取的 bot_token */
  setBotToken(token: string): void {
    this.botToken = token;
  }

  get hasToken(): boolean {
    return !!this.botToken;
  }

  // ─── 内部工具 ────────────────────────────────────────────────

  /**
   * 生成随机 X-WECHAT-UIN 头（base64 编码的随机 uint32）
   * 每次请求都变化，起防重放攻击作用
   */
  private generateWechatUin(): string {
    const randomUint32 = Math.floor(Math.random() * 0xffffffff);
    return Buffer.from(randomUint32.toString()).toString('base64');
  }

  /** 构建认证请求头 */
  private buildHeaders(): Record<string, string> {
    if (!this.botToken) {
      throw new Error('iLink bot_token 未设置，请先完成扫码登录');
    }
    return {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.generateWechatUin(),
      Authorization: `Bearer ${this.botToken}`,
    };
  }

  /** 构建无认证请求头（登录前使用） */
  private buildPublicHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /** 构建 base_info（所有 POST 请求体都必须附带） */
  private buildBaseInfo(): { channel_version: string } {
    return { channel_version: CHANNEL_VERSION };
  }

  /** 生成唯一 client_id（用于 sendMessage 去重和路由） */
  generateClientId(): string {
    return `suiyan-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  // ─── 扫码登录 ────────────────────────────────────────────────

  /**
   * 获取登录二维码
   * GET /ilink/bot/get_bot_qrcode?bot_type=3
   *
   * @returns qrcode(key) 和 qrcode_img_content(URL)
   */
  async getBotQrCode(): Promise<ILinkQrCodeResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;

    this.logger.log('Requesting iLink bot QR code...');

    const resp = await fetch(url, {
      method: 'GET',
      headers: this.buildPublicHeaders(),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`getBotQrCode failed: ${resp.status} ${body.slice(0, 200)}`);
    }

    const data = await resp.json() as ILinkQrCodeResponse;
    this.logger.log(`iLink QR code received: ${data.qrcode_img_content?.slice(0, 60)}...`);
    return data;
  }

  /**
   * 轮询扫码状态
   * GET /ilink/bot/get_qrcode_status?qrcode=xxx
   *
   * 需要请求头 iLink-App-ClientVersion: 1
   * 长轮询模式，可能超时（正常行为，重试即可）
   *
   * @param qrcodeKey 从 getBotQrCode 获取的 qrcode key
   * @returns 扫码状态，confirmed 时包含 bot_token
   */
  async getQrCodeStatus(qrcodeKey: string): Promise<ILinkQrCodeStatusResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeKey)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: this.buildPublicHeaders({ 'iLink-App-ClientVersion': '1' }),
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`getQrCodeStatus failed: ${resp.status} ${body.slice(0, 200)}`);
    }

    return resp.json() as Promise<ILinkQrCodeStatusResponse>;
  }

  // ─── 消息接收（长轮询） ──────────────────────────────────────

  /**
   * 长轮询获取新消息
   * POST /ilink/bot/getupdates
   *
   * 服务器会 hold 住连接最多 35 秒，直到有新消息才返回。
   * 首次请求 get_updates_buf 为空字符串。
   *
   * @param cursor 上次返回的游标，首次为空
   * @returns 新消息列表(msgs)和新的游标
   */
  async getUpdates(cursor: string): Promise<ILinkGetUpdatesResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/getupdates`;

    const body = {
      get_updates_buf: cursor,
      base_info: this.buildBaseInfo(),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`getUpdates failed: ${resp.status} ${text.slice(0, 200)}`);
    }

    const data = await resp.json() as ILinkGetUpdatesResponse;

    // 检查 ret 字段
    if (data.ret !== undefined && data.ret !== 0) {
      // 会话超时，需要重新登录
      if (data.errcode === SESSION_TIMEOUT_ERRCODE) {
        throw new Error('iLink session timeout (errcode -14), need re-login');
      }
      throw new Error(`getUpdates error: ret=${data.ret} errcode=${data.errcode} ${data.errmsg ?? ''}`);
    }

    // 防御：部分版本可能返回 null msgs
    if (!data.msgs) {
      data.msgs = [];
    }

    return data;
  }

  // ─── 消息发送 ────────────────────────────────────────────────

  /**
   * 发送文本消息（完整消息，FINISH 状态）
   *
   * ⚠️ 以下字段缺一不可，否则服务端静默丢弃消息（HTTP 200 但不投递）:
   *  - from_user_id: "" (空字符串)
   *  - client_id: 唯一 UUID
   *  - message_type: 2 (BOT)
   *  - message_state: 2 (FINISH)
   *  - base_info: { channel_version }
   *  - context_token: 从 inbound 消息获取
   *
   * @param toUserId 接收者 ID (xxx@im.wechat)
   * @param contextToken 从 inbound 消息中获取的上下文令牌
   * @param text 文本内容
   * @param clientId 可选，流式回复时复用同一个 client_id
   */
  async sendTextMessage(
    toUserId: string,
    contextToken: string,
    text: string,
    clientId?: string,
  ): Promise<ILinkSendMessageResponse> {
    return this.sendMessage(
      toUserId,
      contextToken,
      [{ type: ILinkItemType.TEXT, text_item: { text } }],
      ILinkMessageState.FINISH,
      clientId,
    );
  }

  /**
   * 发送消息（底层方法，支持流式状态控制）
   *
   * @param toUserId 接收者 ID
   * @param contextToken 上下文令牌
   * @param itemList 消息条目列表
   * @param messageState 0=NEW, 1=GENERATING, 2=FINISH
   * @param clientId 可选，流式回复时复用
   */
  async sendMessage(
    toUserId: string,
    contextToken: string,
    itemList: ILinkMessageItem[],
    messageState: number = ILinkMessageState.FINISH,
    clientId?: string,
  ): Promise<ILinkSendMessageResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/sendmessage`;

    const body = {
      msg: {
        from_user_id: '',
        to_user_id: toUserId,
        client_id: clientId ?? this.generateClientId(),
        message_type: ILinkMessageType.BOT,
        message_state: messageState,
        context_token: contextToken,
        item_list: itemList,
      },
      base_info: this.buildBaseInfo(),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`sendMessage failed: ${resp.status} ${text.slice(0, 200)}`);
    }

    // sendMessage 通常返回空对象 {}，表示成功
    const text = await resp.text();
    if (!text || text.trim() === '{}') {
      return { ret: 0 };
    }

    try {
      return JSON.parse(text) as ILinkSendMessageResponse;
    } catch {
      return { ret: 0 };
    }
  }

  /**
   * 发送流式回复的中间块（GENERATING 状态）
   * 微信端会显示"正在生成..."效果
   *
   * @param toUserId 接收者 ID
   * @param contextToken 上下文令牌
   * @param clientId 必须与最终 FINISH 消息使用同一个 client_id
   * @param partialText 当前累积的文本
   */
  async sendGeneratingChunk(
    toUserId: string,
    contextToken: string,
    clientId: string,
    partialText: string,
  ): Promise<void> {
    await this.sendMessage(
      toUserId,
      contextToken,
      [{ type: ILinkItemType.TEXT, text_item: { text: partialText } }],
      ILinkMessageState.GENERATING,
      clientId,
    );
  }

  /**
   * 发送流式回复的最终块（FINISH 状态）
   *
   * @param toUserId 接收者 ID
   * @param contextToken 上下文令牌
   * @param clientId 必须与之前的 GENERATING 消息使用同一个 client_id
   * @param finalText 最终完整文本
   */
  async sendFinishMessage(
    toUserId: string,
    contextToken: string,
    clientId: string,
    finalText: string,
  ): Promise<void> {
    await this.sendMessage(
      toUserId,
      contextToken,
      [{ type: ILinkItemType.TEXT, text_item: { text: finalText } }],
      ILinkMessageState.FINISH,
      clientId,
    );
  }

  // ─── getConfig ───────────────────────────────────────────────

  /**
   * 获取账号配置（主要是 typing_ticket）
   * POST /ilink/bot/getconfig
   *
   * @param userId 用户 ID (xxx@im.wechat)
   * @param contextToken 上下文令牌（可选）
   * @returns typing_ticket 用于 sendTyping
   */
  async getConfig(
    userId: string,
    contextToken?: string,
  ): Promise<ILinkGetConfigResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/getconfig`;

    const body: Record<string, unknown> = {
      ilink_user_id: userId,
      base_info: this.buildBaseInfo(),
    };
    if (contextToken) {
      body.context_token = contextToken;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`getConfig failed: ${resp.status} ${text.slice(0, 200)}`);
    }

    return resp.json() as Promise<ILinkGetConfigResponse>;
  }

  // ─── 正在输入状态 ────────────────────────────────────────────

  /**
   * 发送"正在输入"状态
   * POST /ilink/bot/sendtyping
   *
   * 需要先调 getConfig 获取 typing_ticket
   *
   * @param userId 用户 ID
   * @param typingTicket 从 getConfig 获取的票据
   * @param isTyping true=正在输入, false=取消输入
   */
  async sendTyping(
    userId: string,
    typingTicket: string,
    isTyping: boolean = true,
  ): Promise<void> {
    const url = `${ILINK_BASE_URL}/ilink/bot/sendtyping`;

    const body = {
      ilink_user_id: userId,
      typing_ticket: typingTicket,
      status: isTyping ? 1 : 2,
      base_info: this.buildBaseInfo(),
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      // sendtyping 失败不影响主流程
      this.logger.debug(`sendTyping failed (non-critical): ${(err as Error).message}`);
    }
  }

  // ─── CDN 媒体上传 ────────────────────────────────────────────

  /**
   * 获取 CDN 上传预签名参数
   * POST /ilink/bot/getuploadurl
   *
   * @param filekey 文件标识
   * @param mediaType 1=IMAGE, 2=VIDEO, 3=FILE
   * @param toUserId 目标用户 ID
   * @param rawsize 原始文件明文大小
   * @param rawfilemd5 原始文件明文 MD5
   * @param filesize AES 加密后密文大小
   */
  async getUploadUrl(
    filekey: string,
    mediaType: number,
    toUserId: string,
    rawsize: number,
    rawfilemd5: string,
    filesize: number,
  ): Promise<ILinkGetUploadUrlResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/getuploadurl`;

    const body = {
      filekey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize,
      rawfilemd5,
      filesize,
      base_info: this.buildBaseInfo(),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`getUploadUrl failed: ${resp.status} ${text.slice(0, 200)}`);
    }

    return resp.json() as Promise<ILinkGetUploadUrlResponse>;
  }

  // ─── 辅助方法 ────────────────────────────────────────────────

  /**
   * 从 inbound 消息中提取文本内容
   */
  static extractText(msg: ILinkInboundMessage): string {
    for (const item of msg.item_list ?? []) {
      if (item.type === ILinkItemType.TEXT && item.text_item?.text) {
        return item.text_item.text;
      }
    }
    return '';
  }

  /**
   * 从 inbound 消息中提取内容类型
   */
  static getItemType(msg: ILinkInboundMessage): number {
    const firstItem = msg.item_list?.[0];
    return firstItem?.type ?? 0;
  }

  /**
   * 判断是否为 Bot 自己发的消息
   * message_type: 1=USER, 2=BOT
   */
  static isBotMessage(msg: ILinkInboundMessage): boolean {
    return msg.message_type === ILinkMessageType.BOT;
  }

  /**
   * 获取消息类型的可读名称
   */
  static getItemTypeName(itemType: number): string {
    const names: Record<number, string> = {
      [ILinkItemType.TEXT]: 'text',
      [ILinkItemType.IMAGE]: 'image',
      [ILinkItemType.VOICE]: 'voice',
      [ILinkItemType.FILE]: 'file',
      [ILinkItemType.VIDEO]: 'video',
    };
    return names[itemType] ?? 'other';
  }
}
