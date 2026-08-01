/**
 * iLink Bot API Type Definitions
 * ─────────────────────────────────────
 * 微信官方 ClawBot iLink 协议类型定义
 * 接入域名: ilinkai.weixin.qq.com
 *
 * @see https://docs.openclaw.ai
 */

// ─── 认证 & 基础 ─────────────────────────────────────────────

/** iLink API 请求头 */
export interface ILinkHeaders {
  'Content-Type': 'application/json';
  AuthorizationType: 'ilink_bot_token';
  'X-WECHAT-UIN': string;
  Authorization: `Bearer ${string}`;
}

// ─── 二维码登录 ──────────────────────────────────────────────

/** get_bot_qrcode 响应 */
export interface ILinkQrCodeResponse {
  /** 二维码内容 URL，可用扫码 */
  qrcode_url: string;
  /** 二维码 base64 图片（部分版本返回） */
  qrcode_base64?: string;
  /** 会话标识，用于后续轮询扫码状态 */
  session_id?: string;
}

/** get_qrcode_status 请求参数 */
export interface ILinkQrCodeStatusRequest {
  session_id: string;
}

/** get_qrcode_status 响应 */
export interface ILinkQrCodeStatusResponse {
  /** 扫码状态: waiting / scanned / confirmed / expired */
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired';
  /** 扫码用户昵称（scanned 后返回） */
  nickname?: string;
  /** 登录成功后返回的 bot_token（confirmed 后返回） */
  bot_token?: string;
  /** bot 的 user_id（confirmed 后返回，格式 xxx@im.bot） */
  bot_id?: string;
}

// ─── 消息接收（长轮询） ──────────────────────────────────────

/** getupdates 请求体 */
export interface ILinkGetUpdatesRequest {
  /** 上次返回的游标，首次为空字符串 */
  get_updates_buf: string;
  base_info: {
    channel_version: string;
  };
}

/** 消息条目类型 */
export interface ILinkMessageItem {
  /** 1=文本, 2=图片, 3=语音, 4=文件, 5=视频 */
  type: number;
  text_item?: { text: string };
  image_item?: { cdn_url: string; file_size?: number };
  voice_item?: { cdn_url: string; duration?: number; text?: string };
  file_item?: { cdn_url: string; file_name: string; file_size: number };
  video_item?: { cdn_url: string; duration?: number; thumbnail?: string };
}

/** 单条收到的微信消息 */
export interface ILinkInboundMessage {
  /** 发送者 ID（格式 xxx@im.wechat） */
  from_user_id: string;
  /** 接收者 ID（格式 xxx@im.bot） */
  to_user_id: string;
  /** 消息类型: 1=文本, 2=图片, 3=语音, 4=文件, 5=视频 */
  message_type: number;
  /** 上下文令牌 — 回复时必须原样带上！ */
  context_token: string;
  /** 消息条目列表 */
  item_list: ILinkMessageItem[];
  /** 消息 ID */
  msg_id?: string;
  /** 消息时间戳（秒） */
  create_time?: number;
  /** 群聊 ID（如果是群消息，格式 xxx@chatroom） */
  chatroom_id?: string;
  /** 群内发送者昵称 */
  sender_nickname?: string;
}

/** getupdates 响应 */
export interface ILinkGetUpdatesResponse {
  /** 新的游标，下次请求时带上 */
  get_updates_buf: string;
  /** 收到的消息列表 */
  messages: ILinkInboundMessage[];
  /** 是否还有更多消息 */
  has_more?: boolean;
}

// ─── 消息发送 ────────────────────────────────────────────────

/** sendmessage 请求体 */
export interface ILinkSendMessageRequest {
  msg: {
    /** 接收者 ID（xxx@im.wechat 或 xxx@chatroom） */
    to_user_id: string;
    /** 消息类型: 1=文本 */
    message_type: number;
    /** 消息状态: 2=完整消息 */
    message_state: number;
    /** 上下文令牌 — 从 inbound 消息中获取，必须原样带上 */
    context_token: string;
    /** 消息条目列表 */
    item_list: ILinkMessageItem[];
  };
}

/** sendmessage 响应 */
export interface ILinkSendMessageResponse {
  /** 发送是否成功 */
  errcode: number;
  /** 错误信息（失败时） */
  errmsg?: string;
  /** 消息 ID */
  msg_id?: string;
}

// ─── 正在输入状态 ────────────────────────────────────────────

/** sendtyping 请求体 */
export interface ILinkSendTypingRequest {
  to_user_id: string;
  context_token: string;
}

// ─── CDN 上传 ────────────────────────────────────────────────

/** getuploadurl 请求体 */
export interface ILinkGetUploadUrlRequest {
  file_type: 'image' | 'voice' | 'file' | 'video';
  file_size: number;
  file_name?: string;
}

/** getuploadurl 响应 */
export interface ILinkGetUploadUrlResponse {
  /** CDN 预签名上传 URL */
  upload_url: string;
  /** 上传后的 CDN 访问 URL */
  cdn_url: string;
  /** 上传凭证（如有） */
  token?: string;
}

// ─── 连接状态 ────────────────────────────────────────────────

/** iLink 连接状态 */
export type ILinkPhase =
  | 'idle'
  | 'waiting_scan'
  | 'waiting_confirm'
  | 'logged_in'
  | 'logged_out'
  | 'error';

/** iLink 连接信息 */
export interface ILinkConnectionInfo {
  botToken: string | null;
  botId: string | null;
  botNickname: string | null;
  phase: ILinkPhase;
  /** 长轮询游标 */
  updateCursor: string;
  /** 是否正在长轮询 */
  isPolling: boolean;
}
