/**
 * iLink Bot API Client
 * ─────────────────────────────────────
 * 微信官方 ClawBot iLink 协议 HTTP 客户端
 *
 * 接入域名: ilinkai.weixin.qq.com
 * 协议版本: 1.0.2
 *
 * 核心能力:
 *  - 扫码登录 (get_bot_qrcode / get_qrcode_status)
 *  - 长轮询收消息 (getupdates, 35s hold)
 *  - 发送消息 (sendmessage, 必须带 context_token)
 *  - 发送"正在输入"状态 (sendtyping)
 *  - CDN 媒体上传 (getuploadurl)
 *
 * @see https://docs.openclaw.ai
 */

import { Logger } from '@nestjs/common';
import {
  ILinkQrCodeResponse,
  ILinkQrCodeStatusResponse,
  ILinkGetUpdatesResponse,
  ILinkSendMessageResponse,
  ILinkGetUploadUrlResponse,
  ILinkInboundMessage,
  ILinkMessageItem,
} from './ilink.types';

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '1.0.2';

/** 长轮询超时（服务器 hold 最多 35s，加 5s 网络余量） */
const POLL_TIMEOUT_MS = 40_000;

/** 普通 API 请求超时 */
const API_TIMEOUT_MS = 15_000;

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
  private buildPublicHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  // ─── 扫码登录 ────────────────────────────────────────────────

  /**
   * 获取登录二维码
   * GET /ilink/bot/get_bot_qrcode?bot_type=3
   *
   * @returns 二维码 URL 和 session_id
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
    this.logger.log(`iLink QR code received: ${data.qrcode_url?.slice(0, 60)}...`);
    return data;
  }

  /**
   * 轮询扫码状态
   * GET /ilink/bot/get_qrcode_status?session_id=xxx
   *
   * @param sessionId 从 getBotQrCode 获取的 session_id
   * @returns 扫码状态，confirmed 时包含 bot_token
   */
  async getQrCodeStatus(sessionId: string): Promise<ILinkQrCodeStatusResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/get_qrcode_status?session_id=${encodeURIComponent(sessionId)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: this.buildPublicHeaders(),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
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
   * @returns 新消息列表和新的游标
   */
  async getUpdates(cursor: string): Promise<ILinkGetUpdatesResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/getupdates`;

    const body = {
      get_updates_buf: cursor,
      base_info: { channel_version: CHANNEL_VERSION },
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

    // 防御：部分版本可能返回 null messages
    if (!data.messages) {
      data.messages = [];
    }

    return data;
  }

  // ─── 消息发送 ────────────────────────────────────────────────

  /**
   * 发送文本消息
   * POST /ilink/bot/sendmessage
   *
   * ⚠️ context_token 必须从收到的 inbound 消息中获取并原样带上！
   *
   * @param toUserId 接收者 ID (xxx@im.wechat 或 xxx@chatroom)
   * @param contextToken 从 inbound 消息中获取的上下文令牌
   * @param text 文本内容
   */
  async sendTextMessage(
    toUserId: string,
    contextToken: string,
    text: string,
  ): Promise<ILinkSendMessageResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/sendmessage`;

    const items: ILinkMessageItem[] = [
      { type: 1, text_item: { text } },
    ];

    const body = {
      msg: {
        to_user_id: toUserId,
        message_type: 1,
        message_state: 2,
        context_token: contextToken,
        item_list: items,
      },
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

    const data = await resp.json() as ILinkSendMessageResponse;

    if (data.errcode !== 0) {
      throw new Error(`sendMessage error: ${data.errcode} ${data.errmsg ?? ''}`);
    }

    return data;
  }

  // ─── 正在输入状态 ────────────────────────────────────────────

  /**
   * 发送"正在输入"状态
   * POST /ilink/bot/sendtyping
   *
   * @param toUserId 接收者 ID
   * @param contextToken 上下文令牌
   */
  async sendTyping(
    toUserId: string,
    contextToken: string,
  ): Promise<void> {
    const url = `${ILINK_BASE_URL}/ilink/bot/sendtyping`;

    const body = {
      to_user_id: toUserId,
      context_token: contextToken,
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
   * 获取 CDN 预签名上传地址
   * POST /ilink/bot/getuploadurl
   *
   * @param fileType 文件类型
   * @param fileSize 文件大小（字节）
   * @param fileName 文件名（可选）
   */
  async getUploadUrl(
    fileType: 'image' | 'voice' | 'file' | 'video',
    fileSize: number,
    fileName?: string,
  ): Promise<ILinkGetUploadUrlResponse> {
    const url = `${ILINK_BASE_URL}/ilink/bot/getuploadurl`;

    const body = {
      file_type: fileType,
      file_size: fileSize,
      file_name: fileName,
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
      if (item.type === 1 && item.text_item?.text) {
        return item.text_item.text;
      }
    }
    return '';
  }

  /**
   * 判断是否为群消息
   */
  static isGroupMessage(msg: ILinkInboundMessage): boolean {
    return !!msg.chatroom_id || msg.from_user_id.includes('@chatroom');
  }

  /**
   * 获取消息类型的可读名称
   */
  static getMessageTypeName(msgType: number): string {
    const names: Record<number, string> = {
      1: 'text',
      2: 'image',
      3: 'voice',
      4: 'file',
      5: 'video',
    };
    return names[msgType] ?? 'other';
  }
}
