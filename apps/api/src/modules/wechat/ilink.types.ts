/**
 * iLink Bot API Type Definitions
 * ─────────────────────────────────────
 * 微信官方 ClawBot iLink 协议类型定义
 * 接入域名: https://ilinkai.weixin.qq.com
 *
 * 协议来源: @tencent-weixin/openclaw-weixin 官方 npm 包逆向
 * 对齐版本: 2.4.6 (channel_version 1.0.3)
 *
 * @see https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin
 */

// ─── 认证 & 基础 ─────────────────────────────────────────────

/** iLink API 请求头 */
export interface ILinkHeaders {
  'Content-Type': 'application/json';
  AuthorizationType: 'ilink_bot_token';
  'X-WECHAT-UIN': string;
  Authorization: `Bearer ${string}`;
}

/** 请求体顶层的 base_info（所有 POST 请求都必须附带） */
export interface ILinkBaseInfo {
  base_info: {
    channel_version: string;
  };
}

// ─── 消息类型 & 状态枚举 ─────────────────────────────────────

/** message_type: 消息发送者类型 */
export enum ILinkMessageType {
  USER = 1,
  BOT = 2,
}

/** message_state: 消息生命周期状态 */
export enum ILinkMessageState {
  NEW = 0,
  GENERATING = 1,
  FINISH = 2,
}

/** MessageItem type: 内容类型 */
export enum ILinkItemType {
  TEXT = 1,
  IMAGE = 2,
  VOICE = 3,
  FILE = 4,
  VIDEO = 5,
}

// ─── 二维码登录 ──────────────────────────────────────────────

/** get_bot_qrcode 响应 */
export interface ILinkQrCodeResponse {
  /** 二维码 key，用于后续轮询扫码状态 */
  qrcode: string;
  /** 二维码内容 URL（可用于生成二维码图片） */
  qrcode_img_content: string;
  /** 二维码 base64 图片（部分版本返回） */
  qrcode_base64?: string;
}

/** get_qrcode_status 响应 */
export interface ILinkQrCodeStatusResponse {
  /** 扫码状态: scaned(已扫码待确认) / confirmed(已确认) / expired(已过期) */
  status: 'scaned' | 'confirmed' | 'expired';
  /** 登录成功后返回的 bot_token（confirmed 后返回） */
  bot_token?: string;
  /** Bot 的 ilink ID（confirmed 后返回，格式 xxx@im.bot） */
  ilink_bot_id?: string;
  /** 扫码人的微信 ID（confirmed 后返回，格式 xxx@im.wechat） */
  ilink_user_id?: string;
}

// ─── 消息接收（长轮询） ──────────────────────────────────────

/** getupdates 请求体 */
export interface ILinkGetUpdatesRequest extends ILinkBaseInfo {
  /** 上次返回的游标，首次为空字符串 */
  get_updates_buf: string;
}

/** 消息条目类型 */
export interface ILinkMessageItem {
  /** 1=文本, 2=图片, 3=语音, 4=文件, 5=视频 */
  type: number;
  text_item?: { text: string };
  image_item?: { cdn_url: string; file_size?: number; aes_key?: string; encrypt_query_param?: string };
  voice_item?: { cdn_url: string; duration?: number; text?: string };
  file_item?: { cdn_url: string; file_name: string; file_size: number };
  video_item?: { cdn_url: string; duration?: number; thumbnail?: string };
  ref_msg?: { msg_id?: string; text?: string };
}

/** 单条收到的微信消息（对齐官方 WeixinMessage 结构） */
export interface ILinkInboundMessage {
  /** 消息序列号 */
  seq?: number;
  /** 唯一消息 ID */
  message_id?: number;
  /** 发送者 ID（格式 xxx@im.wechat） */
  from_user_id?: string;
  /** 接收者 ID（格式 xxx@im.bot） */
  to_user_id?: string;
  /** 创建时间戳（毫秒） */
  create_time_ms?: number;
  /** 会话 ID */
  session_id?: string;
  /** 消息发送者类型: 1=USER, 2=BOT */
  message_type?: number;
  /** 消息状态: 0=NEW, 1=GENERATING, 2=FINISH */
  message_state?: number;
  /** 上下文令牌 — 回复时必须原样带上！ */
  context_token?: string;
  /** 消息条目列表 */
  item_list?: ILinkMessageItem[];
}

/** getupdates 响应 */
export interface ILinkGetUpdatesResponse {
  /** 返回码，0 = 成功 */
  ret?: number;
  /** 错误码（ret 非 0 时），如 -14 = 会话超时 */
  errcode?: number;
  /** 错误描述 */
  errmsg?: string;
  /** 收到的消息列表 */
  msgs?: ILinkInboundMessage[];
  /** 新的游标，下次请求时带上 */
  get_updates_buf?: string;
  /** 服务端建议的下一次长轮询超时时间（毫秒） */
  longpolling_timeout_ms?: number;
}

// ─── 消息发送 ────────────────────────────────────────────────

/** sendmessage 请求体（完整字段，缺一不可） */
export interface ILinkSendMessageRequest extends ILinkBaseInfo {
  msg: {
    /** 发送方 ID，Bot 发送时为空字符串 */
    from_user_id: string;
    /** 接收者 ID（xxx@im.wechat） */
    to_user_id: string;
    /** 每条消息唯一 ID，服务端用于去重和路由（必须！） */
    client_id: string;
    /** 消息发送者类型: 2=BOT */
    message_type: number;
    /** 消息状态: 2=FINISH（完整消息），1=GENERATING（流式中间状态） */
    message_state: number;
    /** 上下文令牌 — 从 inbound 消息中获取，必须原样带上 */
    context_token: string;
    /** 消息条目列表 */
    item_list: ILinkMessageItem[];
  };
}

/** sendmessage 响应（通常为空对象 {}，表示成功） */
export interface ILinkSendMessageResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msg_id?: string;
}

// ─── getConfig ───────────────────────────────────────────────

/** getconfig 请求体 */
export interface ILinkGetConfigRequest extends ILinkBaseInfo {
  /** 用户 ID */
  ilink_user_id: string;
  /** 上下文令牌（可选） */
  context_token?: string;
}

/** getconfig 响应 */
export interface ILinkGetConfigResponse {
  ret?: number;
  /** typing 指示器票据（sendTyping 时必须带上） */
  typing_ticket?: string;
}

// ─── 正在输入状态 ────────────────────────────────────────────

/** sendtyping 请求体 */
export interface ILinkSendTypingRequest extends ILinkBaseInfo {
  /** 用户 ID */
  ilink_user_id: string;
  /** 从 getConfig 获取的 typing 票据 */
  typing_ticket: string;
  /** 1=正在输入, 2=取消输入 */
  status: number;
}

// ─── CDN 上传 ────────────────────────────────────────────────

/** getuploadurl 请求体 */
export interface ILinkGetUploadUrlRequest extends ILinkBaseInfo {
  /** 文件标识 */
  filekey: string;
  /** 媒体类型: 1=IMAGE, 2=VIDEO, 3=FILE */
  media_type: number;
  /** 目标用户 ID */
  to_user_id: string;
  /** 原始文件明文大小 */
  rawsize: number;
  /** 原始文件明文 MD5 */
  rawfilemd5: string;
  /** AES-128-ECB 加密后密文大小 */
  filesize: number;
  /** 缩略图明文大小（IMAGE/VIDEO 必填） */
  thumb_rawsize?: number;
  /** 缩略图明文 MD5（IMAGE/VIDEO 必填） */
  thumb_rawfilemd5?: string;
  /** 缩略图密文大小（IMAGE/VIDEO 必填） */
  thumb_filesize?: number;
}

/** getuploadurl 响应 */
export interface ILinkGetUploadUrlResponse {
  ret?: number;
  /** 原图上传加密参数 */
  upload_param?: string;
  /** 缩略图上传加密参数 */
  thumb_upload_param?: string;
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

/** iLink 登录凭证 */
export interface ILinkCredentials {
  botToken: string;
  botId: string;
  /** 扫码人的微信 ID */
  userId: string;
}
