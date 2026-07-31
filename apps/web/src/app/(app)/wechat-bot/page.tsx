'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Send,
  ArrowLeft,
  MoreVertical,
  Loader2,
  RefreshCw,
  Smartphone,
  Users,
  Smile,
  Plus,
  Wifi,
  ScanLine,
  LogOut,
  Sparkles,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useFamilyHubStore } from '@/stores/family-hub-store';
import { apiClient } from '@/lib/api-client';
import { PageTransition } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { WechatOpsBar, type OpsTileTone } from '@/components/wechat/wechat-ops-bar';

/* ═══════════════ Types ═══════════════ */

interface WechatContact {
  id: string;
  name: string;
  remarkName: string;
  avatar: string;
  type: 'friend' | 'group' | 'official' | 'special';
  isStar: boolean;
  signature: string;
  isAI?: boolean;
  agentCode?: string;
  welcomeMessage?: string;
}

interface WechatMessage {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
  type: 'text' | 'image' | 'voice' | 'file' | 'other';
}

interface WechatStatus {
  connected: boolean;
  loggedIn: boolean;
  userNickName: string | null;
  qrCodeUrl: string | null;
  phase: 'idle' | 'waiting_scan' | 'waiting_confirm' | 'logged_in' | 'logged_out' | 'error';
  contactCount: number;
  lastError: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'contact';
  content: string;
  timestamp: number;
}

/** Virtual AI contact that uses invokeAgent instead of real WeChat */
const AI_CONTACT = {
  id: 'ai-shimo',
  name: '时墨管家',
  remarkName: '',
  avatar: '✨',
  type: 'special' as const,
  isStar: true,
  signature: 'AI 家庭管家 · 全天候在线',
  isAI: true as const,
  agentCode: 'life',
  welcomeMessage: '嗨！我是时墨 🌿 有啥事找我聊就行~',
};

const AVATAR_COLORS = [
  'var(--color-secondary)',
  'var(--color-orange)',
  'var(--color-error)',
  'var(--color-success)',
  'var(--color-purple)',
  'var(--color-info)',
  'var(--color-highlight)',
  'var(--color-error)',
];

/** Mix a CSS variable color with opacity using the design system. */
function colorMix(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

function getAvatarColor(name: string): string {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getAvatarText(name: string): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ═══════════════ Main Page ═══════════════ */

export default function WeChatBotPage() {
  // WeChat connection state
  const [wechatStatus, setWechatStatus] = useState<WechatStatus | null>(null);
  const [showWechatPanel, setShowWechatPanel] = useState(false);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Chat state
  const [realContacts, setRealContacts] = useState<WechatContact[]>([]);
  const [activeContactId, setActiveContactId] = useState<string>(AI_CONTACT.id);
  const [messagesByContact, setMessagesByContact] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);

  const invokeAgent = useFamilyHubStore((s) => s.invokeAgent);
  const shimoCore = useFamilyHubStore((s) => s.shimoCore);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── Derived ops-bar props ── */
  const opsRuntime = useMemo((): { tone: OpsTileTone; label: string; activeAgents?: number } => {
    if (!shimoCore) return { tone: 'idle', label: '加载中…' };
    // Shimo core is always "on" — but different sub-states map to different tones
    const activeStates: string[] = ['thinking', 'learning', 'updating_memory', 'updating_tree', 'syncing_wechat'];
    const tone: OpsTileTone = shimoCore.status === 'online' ? 'ok' : activeStates.includes(shimoCore.status) ? 'pending' : 'warn';
    const label =
      shimoCore.status === 'online'
        ? '运行中'
        : shimoCore.status === 'thinking'
          ? '思考中'
          : shimoCore.status === 'learning'
            ? '学习中'
            : shimoCore.status === 'updating_memory'
              ? '更新记忆'
              : shimoCore.status === 'updating_tree'
                ? '生长中'
                : shimoCore.status === 'syncing_wechat'
                  ? '同步微信'
                  : '待机';
    return { tone, label, activeAgents: shimoCore.agentCount };
  }, [shimoCore]);

  const opsSession = useMemo((): {
    tone: OpsTileTone;
    label: string;
    nickName?: string | null;
    contactCount?: number;
    lastError?: string | null;
    phase?: string;
    hasSyncIssue?: boolean;
  } => {
    if (!wechatStatus) return { tone: 'idle', label: '未连接', phase: 'idle' };
    if (wechatStatus.loggedIn) {
      const rawError = wechatStatus.lastError;
      // 1102 / 同步异常属于非致命错误：后端会自动重连，AI 管家仍可用（降级模式）
      const isSyncIssue =
        !!rawError && (rawError.includes('1102') || rawError.includes('同步'));
      const tone: OpsTileTone = rawError ? 'warn' : 'ok';
      // 对前端更友好的错误文案，避免直接暴露原始错误码造成困惑
      const friendlyError = isSyncIssue
        ? '微信消息同步异常，正在自动重连，AI 管家不受影响'
        : rawError;
      return {
        tone,
        label: tone === 'warn' ? (isSyncIssue ? '同步中' : '已连接') : '已连接',
        nickName: wechatStatus.userNickName,
        contactCount: wechatStatus.contactCount,
        lastError: friendlyError,
        phase: wechatStatus.phase,
        hasSyncIssue: isSyncIssue,
      };
    }
    if (wechatStatus.phase === 'waiting_scan' || wechatStatus.phase === 'waiting_confirm') {
      return { tone: 'pending', label: '扫码登录', phase: wechatStatus.phase };
    }
    if (wechatStatus.phase === 'error') {
      return { tone: 'error', label: '登录失败', phase: wechatStatus.phase };
    }
    return { tone: 'idle', label: '未连接', phase: wechatStatus.phase };
  }, [wechatStatus]);

  const opsBridge = useMemo((): { tone: OpsTileTone; label: string; detail?: string } => {
    // Emergency bridge is always armed — it's the fallback AI path
    return { tone: 'ok', label: '已就绪', detail: '时墨 AI 直连 · 无需微信' };
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiWelcomeInitRef = useRef(false);

  /* ── Initialize AI welcome message on mount ── */
  useEffect(() => {
    if (aiWelcomeInitRef.current) return;
    aiWelcomeInitRef.current = true;
    setMessagesByContact((prev) => {
      if (prev[AI_CONTACT.id]) return prev;
      return {
        ...prev,
        [AI_CONTACT.id]: [
          {
            id: genId(),
            role: 'contact',
            content: AI_CONTACT.welcomeMessage,
            timestamp: Date.now(),
          },
        ],
      };
    });
  }, []);

  /* ── Check WeChat status on mount (non-blocking) ── */
  const checkStatus = useCallback(async () => {
    try {
      const res = await apiClient.get<WechatStatus>('wechat/status');
      setWechatStatus(res);
      if (res?.loggedIn && res.phase === 'logged_in') {
        const contactsRes = await apiClient.get<WechatContact[]>('wechat/contacts');
        if (contactsRes && contactsRes.length > 0) {
          setRealContacts(contactsRes);
        }
      }
      return res;
    } catch {
      setWechatStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  /* ── Start WeChat login ── */
  const startLogin = useCallback(async () => {
    setLoadingQR(true);
    setQrError(null);
    try {
      const res = await apiClient.post<{ success: boolean; qrCodeUrl: string }>('wechat/login');
      if (res?.qrCodeUrl) {
        try {
          const QRCode = (await import('qrcode')).default;
          const dataUrl = await QRCode.toDataURL(res.qrCodeUrl, {
            width: 264,
            margin: 2,
            color: { dark: '#06060e', light: '#ffffff' },
          });
          setWechatStatus((prev) => ({
            ...(prev || {}),
            qrCodeUrl: dataUrl,
            phase: 'waiting_scan',
            connected: false,
            loggedIn: false,
            userNickName: null,
            contactCount: 0,
            lastError: null,
          }));
        } catch {
          setWechatStatus((prev) => ({
            connected: prev?.connected ?? false,
            loggedIn: prev?.loggedIn ?? false,
            userNickName: prev?.userNickName ?? null,
            contactCount: prev?.contactCount ?? 0,
            lastError: prev?.lastError ?? null,
            qrCodeUrl: res.qrCodeUrl,
            phase: 'waiting_scan',
          }));
        }
      }
    } catch (err: unknown) {
      setQrError(err instanceof Error ? err.message : '获取二维码失败');
    } finally {
      setLoadingQR(false);
    }
  }, []);

  /* ── Poll status while waiting for scan ── */
  const wechatPhase = wechatStatus?.phase;

  /**
   * 未连接时自动拉取二维码：连接微信是本页的主动作，
   * 不该让用户先点一次「获取二维码」才看到内容。
   */
  const autoQrRequested = useRef(false);
  useEffect(() => {
    if (autoQrRequested.current) return;
    if (!wechatStatus) return; // 等首次状态返回，避免与 checkStatus 竞态
    if (wechatStatus.loggedIn) return;
    if (wechatStatus.qrCodeUrl) return;
    if (wechatPhase === 'waiting_scan' || wechatPhase === 'waiting_confirm') return;
    autoQrRequested.current = true;
    void startLogin();
  }, [wechatStatus, wechatPhase, startLogin]);

  useEffect(() => {
    if (!wechatPhase) return;
    if (wechatPhase === 'idle' || wechatPhase === 'logged_in' || wechatPhase === 'logged_out') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      const res = await checkStatus();
      if (res?.phase === 'logged_in' || res?.phase === 'error') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [wechatPhase, checkStatus]);

  /* ── Load messages for real WeChat contacts ── */
  const loadMessages = useCallback(async (contactId: string) => {
    if (contactId === AI_CONTACT.id) return;
    try {
      const res = await apiClient.get<WechatMessage[]>(`wechat/messages/${contactId}`);
      if (res && res.length > 0) {
        const mapped: ChatMessage[] = res.map((m) => ({
          id: m.id,
          role: m.isSelf ? 'user' : 'contact',
          content: m.content,
          timestamp: m.timestamp,
        }));
        setMessagesByContact((prev) => ({ ...prev, [contactId]: mapped }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!wechatStatus?.loggedIn) return;
    if (activeContactId === AI_CONTACT.id) return;
    loadMessages(activeContactId);
    const interval = setInterval(() => loadMessages(activeContactId), 3000);
    return () => clearInterval(interval);
  }, [activeContactId, wechatStatus?.loggedIn, loadMessages]);

  /* ── Logout ── */
  const handleLogout = useCallback(async () => {
    try {
      await apiClient.post('wechat/logout');
      setWechatStatus(null);
      setRealContacts([]);
      setActiveContactId(AI_CONTACT.id);
    } catch {
      // ignore
    }
  }, []);

  /* ── All contacts (AI first, then real) — MUST be before handleSend ── */
  const allContacts = useMemo(() => {
    return [AI_CONTACT, ...realContacts];
  }, [realContacts]);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return allContacts;
    return allContacts.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, allContacts]);

  const activeContact = allContacts.find((c) => c.id === activeContactId) ?? allContacts[0];
  const activeMessages = messagesByContact[activeContactId] ?? [];
  const isWechatLoggedIn = wechatStatus?.loggedIn ?? false;
  // 1102 sync errors are non-fatal (backend auto-reconnects); only hard errors block
  const isWechatBlocked = wechatStatus?.phase === 'error' && !wechatStatus?.loggedIn;
  // Sync issues: logged in but lastError indicates sync problems (auto-reconnecting)
  const hasSyncIssue = isWechatLoggedIn && !!wechatStatus?.lastError && (wechatStatus.lastError.includes('同步') || wechatStatus.lastError.includes('1102'));

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messagesByContact, activeContactId, sending]);

  /* ── Send message ── */
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const contactId = activeContactId;
    const contact = allContacts.find((c) => c.id === contactId);
    if (!contact) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    setMessagesByContact((prev) => ({
      ...prev,
      [contactId]: [...(prev[contactId] ?? []), { id: genId(), role: 'user', content, timestamp: Date.now() }],
    }));

    setSending(true);

    try {
      if (contact.isAI) {
        const result = await invokeAgent(contact.agentCode || 'life', content);
        setMessagesByContact((prev) => ({
          ...prev,
          [contactId]: [
            ...(prev[contactId] ?? []),
            { id: genId(), role: 'contact', content: result.response, timestamp: Date.now() },
          ],
        }));
      } else {
        await apiClient.post('wechat/send', { toId: contactId, content });
      }
    } catch {
      setMessagesByContact((prev) => ({
        ...prev,
        [contactId]: [
          ...(prev[contactId] ?? []),
          { id: genId(), role: 'contact', content: '消息发送失败了 😅 稍后再试试', timestamp: Date.now() },
        ],
      }));
    } finally {
      setSending(false);
    }
  }, [input, sending, activeContactId, invokeAgent, allContacts]);

  /* ── Keyboard & input handlers ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleSelectContact = (contactId: string) => {
    setActiveContactId(contactId);
    setShowMobileChat(true);
  };

  /* ═══════════════ Render ═══════════════ */

  /**
   * 未连接微信时，页面主体是「扫码连接」，而不是聊天界面。
   * 微信 Bot 的核心价值是把时墨接入家庭微信群，聊天只是连接成功后的附属能力。
   */
  if (!isWechatLoggedIn) {
    return (
      <PageTransition>
        <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--safe-top) - var(--home-dock-clearance))' }}>
          <WechatOpsBar
            runtime={opsRuntime}
            session={opsSession}
            bridge={opsBridge}
            onRefresh={checkStatus}
          />
          <WechatConnectStage
            status={wechatStatus}
            loadingQR={loadingQR}
            qrError={qrError}
            isBlocked={isWechatBlocked}
            onLogin={startLogin}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--safe-top) - var(--home-dock-clearance))' }}>
        {/* WeChat Operational Control Ribbon */}
        <WechatOpsBar
          runtime={opsRuntime}
          session={opsSession}
          bridge={opsBridge}
          onRefresh={checkStatus}
        />

        <div className="flex-1 px-3 pt-3 pb-1 sm:px-4 sm:pt-3 min-h-0">
          <GlassLayer intensity="default" className="flex h-full overflow-hidden">
          {/* ── Contact List (left) ── */}
          <div
            className={`${
              showMobileChat ? 'hidden' : 'flex'
            } w-full flex-col border-r border-[var(--color-gray-900)] sm:flex sm:w-72 sm:flex-shrink-0`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-gray-900)]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/15">
                  <Sparkles className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-text">消息</h1>
                  <div className="flex items-center gap-1 text-3xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    <span>AI 管家在线</span>
                  </div>
                </div>
              </div>
              {/* WeChat connect button */}
              <button
                onClick={() => setShowWechatPanel(true)}
                title="连接微信"
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 transition-colors ${
                  hasSyncIssue
                    ? 'bg-highlight/10 text-highlight'
                    : isWechatLoggedIn
                      ? 'bg-success/10 text-success'
                      : 'text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text'
                }`}
              >
                {hasSyncIssue ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wifi className="h-3.5 w-3.5" />
                )}
                <span className="text-3xs font-medium">
                  {hasSyncIssue ? '同步中...' : isWechatLoggedIn ? '微信已连' : '连微信'}
                </span>
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <GlassLayer
                intensity="subtle"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg [&:focus-within]:bg-[var(--color-glass-hover)] [&:focus-within]:border-[var(--color-border-focus)] [&:focus-within]:shadow-[var(--shadow-inner),var(--shadow-focus)]"
              >
                <Search className="h-3.5 w-3.5 text-text-subtle flex-shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索联系人..."
                  aria-label="搜索联系人"
                  className="w-full bg-transparent text-xs text-text placeholder:text-text-subtle outline-none focus-ring"
                />
              </GlassLayer>
            </div>

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-subtle">
                  <Users className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">暂无联系人</p>
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isActive={contact.id === activeContactId}
                    lastMessage={messagesByContact[contact.id]?.slice(-1)[0]?.content || ''}
                    onClick={() => handleSelectContact(contact.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Chat Panel (right) ── */}
          <div
            className={`${
              showMobileChat ? 'flex' : 'hidden'
            } w-full flex-col sm:flex`}
          >
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-gray-900)]">
              <button
                onClick={() => setShowMobileChat(false)}
                aria-label="返回"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text transition-colors sm:hidden focus-ring"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-lg flex-shrink-0"
                style={{
                  backgroundColor: activeContact.isAI
                    ? colorMix('var(--color-secondary)', 0.15)
                    : colorMix(getAvatarColor(activeContact.name), 0.12),
                }}
              >
                {activeContact.isAI ? (
                  '✨'
                ) : (
                  <span className="text-sm font-bold text-text">
                    {getAvatarText(activeContact.name)}
                  </span>
                )}
                {activeContact.isAI && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text truncate">
                  {activeContact.name}
                </h2>
                <p className="text-2xs text-text-subtle truncate">
                  {activeContact.isAI ? 'AI 家庭管家 · 在线' : activeContact.signature || '微信联系人'}
                </p>
              </div>
              <button aria-label="更多操作" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text transition-colors focus-ring">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {activeMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-subtle">
                  <Smile className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">开始聊天吧~</p>
                </div>
              ) : (
                activeMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} contact={activeContact} />
                ))
              )}

              {/* Typing indicator */}
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2"
                >
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm"
                    style={{
                      backgroundColor: activeContact.isAI
                        ? colorMix('var(--color-secondary)', 0.15)
                        : colorMix(getAvatarColor(activeContact.name), 0.12),
                    }}
                  >
                    {activeContact.isAI ? '✨' : getAvatarText(activeContact.name)}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-[var(--color-gray-900)] border border-[var(--color-gray-900)] px-4 py-3">
                    <TypingDot delay={0} />
                    <TypingDot delay={0.15} />
                    <TypingDot delay={0.3} />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-[var(--color-gray-900)] px-4 py-3">
              <div className="flex items-end gap-2">
                <button aria-label="表情" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text transition-colors focus-ring">
                  <Smile className="h-5 w-5" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  aria-label="输入消息"
                  rows={1}
                  disabled={sending}
                  className="min-h-9 flex-1 resize-none rounded-xl bg-[var(--color-gray-950)] border border-[var(--color-gray-900)] px-3 py-2 text-sm text-text placeholder:text-text-subtle outline-none focus:border-secondary/30 transition-colors disabled:opacity-[var(--state-disabled-opacity)] focus-ring max-h-30"
                />
                <button aria-label="添加附件" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text transition-colors focus-ring">
                  <Plus className="h-5 w-5" />
                </button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSend}
                  aria-label="发送"
                  disabled={!input.trim() || sending}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors focus-ring ${
                    input.trim() && !sending
                      ? 'bg-secondary text-[var(--color-text-primary)] hover:bg-secondary-active'
                      : 'bg-[var(--color-gray-950)] text-text-subtle'
                  }`}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </motion.button>
              </div>
            </div>
          </div>
          </GlassLayer>
        </div>
      </div>

      {/* ── WeChat Connection Panel (slide-in overlay) ── */}
      <AnimatePresence>
        {showWechatPanel && (
          <WechatPanel
            status={wechatStatus}
            loadingQR={loadingQR}
            qrError={qrError}
            isBlocked={isWechatBlocked}
            onLogin={startLogin}
            onLogout={handleLogout}
            onClose={() => setShowWechatPanel(false)}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

/* ═══════════════ Sub-components ═══════════════ */

/* ── WeChat Connect Stage（未连接时的页面主体：扫码连接）── */
function WechatConnectStage({
  status,
  loadingQR,
  qrError,
  isBlocked,
  onLogin,
}: {
  status: WechatStatus | null;
  loadingQR: boolean;
  qrError: string | null;
  isBlocked: boolean;
  onLogin: () => void;
}) {
  const phase = status?.phase ?? 'idle';
  const qrCodeUrl = status?.qrCodeUrl ?? null;

  const hint = useMemo(() => {
    switch (phase) {
      case 'waiting_scan':
        return '打开手机微信，扫描上方二维码';
      case 'waiting_confirm':
        return '已扫描，请在手机上点击确认登录';
      case 'error':
        return '登录失败，账号可能被限制网页版登录';
      default:
        return '连接后，时墨可以在家庭微信群里陪伴家人';
    }
  }, [phase]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 min-h-0 overflow-y-auto">
      <GlassLayer
        intensity="strong"
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl px-8 py-10 text-center"
      >
        {/* 标题 */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
            <ScanLine className="h-6 w-6 text-success" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-text">连接家庭微信</h1>
          <p className="max-w-xs text-xs leading-relaxed text-text-muted">{hint}</p>
        </div>

        {/* 二维码主视觉 */}
        <div className="relative flex h-64 w-64 items-center justify-center rounded-2xl bg-[var(--color-glass)] border border-[var(--color-border)]">
          {loadingQR ? (
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Loader2 className="h-7 w-7 animate-spin text-success" aria-hidden="true" />
              <span className="text-xs">正在生成二维码...</span>
            </div>
          ) : qrCodeUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeUrl}
                alt="微信登录二维码"
                className="h-56 w-56 rounded-xl bg-white p-2"
              />
              {phase === 'waiting_confirm' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/80 backdrop-blur-sm">
                  <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
                  <span className="text-xs font-medium text-text">扫描成功，请在手机确认</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-text-subtle">
              <Smartphone className="h-9 w-9 opacity-40" aria-hidden="true" />
              <span className="text-xs leading-relaxed">
                点击下方按钮获取二维码
              </span>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {(qrError || isBlocked) && (
          <div className="flex w-full items-start gap-2 rounded-xl border border-error/20 bg-error/10 p-3 text-left">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-text-muted">
              {qrError || '该微信账号被限制网页版登录，请换一个注册满半年且常用的账号试试。'}
            </p>
          </div>
        )}

        {/* 操作按钮 */}
        <button
          onClick={onLogin}
          disabled={loadingQR}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-success/90 disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
        >
          {loadingQR ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {qrCodeUrl ? '刷新二维码' : '获取二维码'}
        </button>

        {/* 连接后能力说明 */}
        <div className="w-full border-t border-[var(--color-border)] pt-5 text-left">
          <p className="mb-3 text-3xs font-medium uppercase tracking-wider text-text-subtle">
            连接后时墨可以
          </p>
          <ul className="flex flex-col gap-2 text-xs text-text-muted">
            <li className="flex items-start gap-2">
              <Users className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden="true" />
              在家庭群里回应家人的消息
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-highlight" aria-hidden="true" />
              把聊天中的家庭记忆自动沉淀下来
            </li>
            <li className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-purple" aria-hidden="true" />
              给长辈发送健康与日程提醒
            </li>
          </ul>
        </div>
      </GlassLayer>
    </div>
  );
}

/* ── WeChat Connection Panel ── */
function WechatPanel({
  status,
  loadingQR,
  qrError,
  isBlocked,
  onLogin,
  onLogout,
  onClose,
}: {
  status: WechatStatus | null;
  loadingQR: boolean;
  qrError: string | null;
  isBlocked: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const phase = status?.phase ?? 'idle';
  const qrCodeUrl = status?.qrCodeUrl ?? null;
  const isLoggedIn = status?.loggedIn ?? false;

  const statusText = useMemo(() => {
    switch (phase) {
      case 'idle':
        return '点击下方按钮扫码登录';
      case 'waiting_scan':
        return '请使用微信扫码登录';
      case 'waiting_confirm':
        return '已扫描，请在手机上确认';
      case 'logged_in':
        return '登录成功！';
      case 'error':
        return '登录失败，可能是账号被限制';
      default:
        return '';
    }
  }, [phase]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="button"
        aria-label="关闭"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        className="fixed inset-0 z-overlay bg-background/60 backdrop-blur-sm"
      />

      {/* Panel */}
      <GlassLayer
        asChild
        intensity="default"
        className="fixed right-0 top-0 z-modal flex h-full w-full max-w-sm flex-col border-l border-[var(--color-gray-800)]"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-gray-900)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15">
              <ScanLine className="h-4 w-4 text-success" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">连接微信</h2>
              <p className="text-3xs text-text-subtle">可选 · 连接后可收发微信消息</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--color-gray-900)] hover:text-text transition-colors focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {isLoggedIn ? (
            /* Logged in state */
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text">微信已连接</p>
                <p className="text-xs text-text-muted mt-1">
                  {status?.userNickName || '已登录'} · {status?.contactCount || 0} 个联系人
                </p>
              </div>

              {/* Sync warning */}
              {status?.lastError && (status.lastError.includes('同步') || status.lastError.includes('1102')) && (
                <div className="w-full rounded-xl bg-highlight/10 border border-highlight/15 p-3 flex items-start gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-highlight animate-spin flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-highlight">消息同步异常</p>
                    <p className="text-3xs text-text-muted mt-0.5 leading-relaxed">
                      {status.lastError}
                      <br />
                      后端正在自动重连，不影响 AI 管家使用。
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={onLogout}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-gray-900)] px-4 py-2 text-xs text-text-muted hover:bg-[var(--color-gray-700)] hover:text-text transition-colors focus-ring"
              >
                <LogOut className="h-3.5 w-3.5" />
                断开连接
              </button>
            </div>
          ) : isBlocked ? (
            /* Blocked state — only for genuine login failures */
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/15">
                <AlertCircle className="h-8 w-8 text-error" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text">微信登录失败</p>
                <p className="text-xs text-text-muted mt-2 leading-relaxed max-w-xs">
                  {status?.lastError || '登录过程中出现问题，可能是网络波动或账号限制。'}
                  <br />
                  可以稍后重试，不影响 AI 管家使用。
                </p>
              </div>
              <div className="w-full rounded-xl bg-[var(--color-gray-950)] border border-[var(--color-gray-900)] p-4 mt-2">
                <p className="text-xs text-text-muted leading-relaxed">
                  💡 <span className="text-text">不影响使用</span>
                  <br />
                  AI 管家始终在线，无需微信也能聊天。
                  部分账号可能因腾讯网页版限制无法登录。
                </p>
              </div>
              <button
                onClick={onLogin}
                className="flex items-center gap-2 rounded-xl bg-success px-5 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-success/80 transition-colors mt-2 focus-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新尝试
              </button>
            </div>
          ) : (
            /* QR Login state */
            <div className="flex flex-col items-center">
              {/* QR Code */}
              <div className="relative">
                <div
                  className={`relative rounded-2xl bg-text p-3 transition-[opacity,transform] ${
                    phase === 'waiting_scan' || phase === 'waiting_confirm' ? '' : 'opacity-40'
                  }`}
                >
                  {qrCodeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCodeUrl} alt="微信登录二维码" className="h-52 w-52" />
                  ) : (
                    <div className="flex h-52 w-52 items-center justify-center">
                      {loadingQR ? (
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-apple-gray)]" />
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Smartphone className="h-10 w-10 text-[var(--color-apple-gray)]" />
                          <span className="text-xs text-[var(--color-apple-gray)]">等待扫码</span>
                        </div>
                      )}
                    </div>
                  )}

                  {(phase === 'waiting_confirm' || phase === 'logged_in') && (
                    <div className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-xl bg-[var(--color-gray-50)]">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-success"
                      >
                        <ScanLine className="h-6 w-6 text-text" />
                      </motion.div>
                      <span className="text-sm font-medium text-[var(--color-text-inverse)]">
                        {phase === 'waiting_confirm' ? '已扫码，请确认' : '登录成功'}
                      </span>
                    </div>
                  )}
                </div>

                {phase === 'waiting_scan' && qrCodeUrl && (
                  <motion.div
                    initial={{ top: '12px' }}
                    animate={{ top: '200px' }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }}
                    className="absolute left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-success to-transparent"
                  />
                )}
              </div>

              {/* Status */}
              <div className="mt-5 flex items-center gap-2">
                {(phase === 'waiting_confirm' || loadingQR) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-success" />
                )}
                <span className="text-sm text-text-muted">{statusText}</span>
              </div>

              {/* Login button */}
              {(phase === 'idle' || phase === 'logged_out' || phase === 'error' || (!qrCodeUrl && !loadingQR)) && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onLogin}
                  disabled={loadingQR}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-success px-6 py-2.5 text-sm font-medium text-text-inverse hover:bg-success/80 transition-colors disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
                >
                  {loadingQR ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在获取二维码...
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-4 w-4" />
                      扫码登录微信
                    </>
                  )}
                </motion.button>
              )}

              {/* Refresh */}
              {qrCodeUrl && phase === 'waiting_scan' && (
                <button
                  onClick={onLogin}
                  className="mt-3 flex items-center gap-1.5 text-xs text-text-subtle hover:text-text transition-colors focus-ring"
                >
                  <RefreshCw className="h-3 w-3" />
                  刷新二维码
                </button>
              )}

              {/* Error */}
              {qrError && (
                <p className="mt-3 text-center text-xs text-error">{qrError}</p>
              )}

              {/* Tip */}
              <div className="mt-6 w-full rounded-xl bg-[var(--color-gray-950)] border border-[var(--color-gray-900)] p-4">
                <p className="text-2xs text-text-subtle leading-relaxed text-center">
                  ⚠️ 部分微信账号（2017年后注册）可能无法使用网页版
                  <br />
                  不影响 AI 管家的正常使用
                </p>
              </div>
            </div>
          )}
        </div>
        </motion.div>
      </GlassLayer>
    </>
  );
}

/* ── Contact Item ── */
function ContactItem({
  contact,
  isActive,
  lastMessage,
  onClick,
}: {
  contact: WechatContact;
  isActive: boolean;
  lastMessage: string;
  onClick: () => void;
}) {
  const isAI = contact.isAI;
  const color = isAI ? 'var(--color-secondary)' : getAvatarColor(contact.name);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-ring ${
        isActive ? 'bg-[var(--color-gray-900)]' : 'hover:bg-[var(--color-gray-950)]'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{ backgroundColor: colorMix(color, 0.12) }}
        >
          {isAI ? (
            '✨'
          ) : (
            <span className="text-sm font-bold" style={{ color }}>
              {getAvatarText(contact.name)}
            </span>
          )}
        </div>
        {isAI && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 border-b border-[var(--color-gray-950)] pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text truncate">
            {contact.name}
          </span>
          {isAI && (
            <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-4xs text-secondary flex-shrink-0">
              AI
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted truncate mt-0.5">
          {lastMessage || contact.signature || (isAI ? 'AI 家庭管家' : '微信联系人')}
        </p>
      </div>
    </button>
  );
}

/* ── Message Bubble ── */
function MessageBubble({
  message,
  contact,
}: {
  message: ChatMessage;
  contact: WechatContact;
}) {
  const isUser = message.role === 'user';
  const isAI = contact.isAI;
  const color = isAI ? 'var(--color-secondary)' : getAvatarColor(contact.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm"
        style={{
          backgroundColor: isUser ? colorMix('var(--color-secondary)', 0.15) : colorMix(color, 0.12),
        }}
      >
        {isUser ? (
          '我'
        ) : isAI ? (
          '✨'
        ) : (
          <span className="text-xs font-bold" style={{ color }}>
            {getAvatarText(contact.name)}
          </span>
        )}
      </div>

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-72p whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
            isUser
              ? 'bg-secondary/15 border border-secondary/15 rounded-2xl rounded-tr-sm text-text'
              : 'bg-[var(--color-gray-900)] border border-[var(--color-gray-900)] rounded-2xl rounded-tl-sm text-text'
          }`}
        >
          {message.content}
        </div>
        <span className="mt-1 px-1 text-3xs text-text-muted/50">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

/* ── Typing Dot ── */
function TypingDot({ delay }: { delay: number }) {
  return (
    <motion.span
      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 0.8, repeat: Infinity, delay, ease: 'easeInOut' }}
      className="h-1.5 w-1.5 rounded-full bg-text-muted"
    />
  );
}
