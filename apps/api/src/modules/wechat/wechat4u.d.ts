declare module 'wechat4u' {
  export interface Wechat4uContact {
    UserName: string;
    NickName: string;
    RemarkName: string;
    HeadImgUrl: string;
    VerifyFlag: number;
    Type: number;
    StarFriend: number;
    Sex: number;
    Signature: string;
    AppAccountFlag: number;
    StatFlag: number;
    AttrStatus: number;
    Province: string;
    City: string;
    Alias: string;
    KeyWord: string;
    HideInputBarFlag: number;
    DisplayName: string;
    OwnerUin: number;
    ChatRoomId: number;
    UnreadCount: number;
    ContactType: number;
    Special?: number;
  }

  export interface Wechat4uMessage {
    FromUserName: string;
    ToUserName: string;
    MsgType: number;
    Content: string;
    MsgId: string;
    CreateTime: number;
    NewMsgId: string;
    Status: number;
    VoiceLength: number;
    MediaId: string;
    FileName: string;
    FileSize: string;
    ImgHeight: number;
    ImgWidth: number;
    Ticket: string;
    ImgStatus: number;
    Url: string;
    RecommendInfo: any;
    HasProductId: number;
    EncryFileName: string;
    ForwardFlag: number;
    AppMsgType: number;
    PlayLength: number;
    CampaignTag: string;
    OriginalContent: string;
  }

  export default class Wechat {
    constructor();
    constructor(botData: any);

    // State
    user: { Uin: string; Sid: string; SKey: string; NickName: string; UserName: string };
    contacts: Record<string, Wechat4uContact>;
    state: string;
    botData: any;

    // Events
    on(event: 'uuid', listener: (uuid: string) => void): this;
    on(event: 'scan', listener: () => void): this;
    on(event: 'confirm', listener: () => void): this;
    on(event: 'login', listener: () => void): this;
    on(event: 'logout', listener: () => void): this;
    on(event: 'message', listener: (msg: Wechat4uMessage) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'contacts-updated', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    // Methods
    start(): void;
    restart(): void;
    stop(): void;
    logout(): void;
    sendMsg(msg: string, to: string): Promise<{ BaseResponse: { Ret: number } }>;
    sendMsg(msg: string, to: string, cb: (err: Error | null, res: any) => void): void;
    getContact(id: string): Promise<Wechat4uContact>;
    getHeadImg(id: string): Promise<Buffer>;
    updateContacts(): Promise<void>;
    sendEmoticon(emoticonId: string, to: string): Promise<any>;
    reply(msg: Wechat4uMessage, content: string): Promise<any>;
    forward(msg: Wechat4uMessage, to: string): Promise<any>;
  }
}
