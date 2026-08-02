'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useSSEChat } from '@/hooks/use-sse-chat';
import { GlassLayer } from '@/components/glass';
import type { ChatMessage } from '@/lib/types';

/**
 * HomeChatOverlay — 首页浮动聊天面板
 * ─────────────────────────────────────────
 * 用户在首页输入框发送消息后，弹出此面板展示时墨的流式回复。
 * 使用与倾诉页相同的 SSE 流式接口，保持一致的聊天体验。
 *
 * 支持 AI 消息中的图片渲染：
 * 1. 检测消息内容中的 markdown 图片语法 `![alt](url)`
 * 2. 兼容 ChatMessage 上可能附加的 imageUrl 字段（预留 SSE 扩展）
 * 3. 提取图片后以文字 + 图片卡片的形式渲染
 */

/** markdown 图片正则：匹配 `![alt](url)` */
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** 提取消息中的图片 URL 与纯文本 */
function extractImages(content: string): { text: string; images: { alt: string; url: string }[] } {
  const images: { alt: string; url: string }[] = [];
  // 复制正则避免 lastIndex 污染
  const re = new RegExp(MARKDOWN_IMAGE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    images.push({ alt: match[1] || '图片', url: match[2] });
  }
  // 移除图片 markdown 后的纯文本
  const text = content.replace(MARKDOWN_IMAGE_RE, '').trim();
  return { text, images };
}

/**
 * LazyImage — 带加载动画的懒加载图片
 *
 * 图片加载完成前显示 shimmer 骨架屏，加载后淡入显示。
 * 点击可全屏查看。
 */
function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setFullscreen(true)}
        className="relative block w-full overflow-hidden rounded-xl border border-[var(--color-glass-border-strong)] shadow-lg focus-ring"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        aria-label={`查看图片：${alt}`}
      >
        {/* 骨架屏 / 加载动画 */}
        {!loaded && (
          <div className="flex aspect-video w-full items-center justify-center bg-[var(--color-gray-950)]">
            <motion.div
              className="flex items-center gap-2 text-text-muted"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ImageIcon className="h-4 w-4" />
              <span className="text-xs">加载图片中...</span>
            </motion.div>
          </div>
        )}
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="max-w-full rounded-xl"
          style={{
            display: loaded ? 'block' : 'none',
            width: '100%',
            height: 'auto',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
      </motion.button>

      {/* 全屏查看 */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setFullscreen(false)}
          >
            <button
              className="absolute top-4 right-4 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10"
              onClick={() => setFullscreen(false)}
              aria-label="关闭全屏"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain rounded-lg"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * MessageImageCard — AI 消息中的图片卡片
 *
 * 玻璃边框、圆角、阴影，在文字回复下方展示截图。
 */
function MessageImageCard({ images }: { images: { alt: string; url: string }[] }) {
  return (
    <div className="mt-2.5 space-y-2">
      {images.map((img, idx) => (
        <GlassLayer
          key={`${img.url}-${idx}`}
          intensity="subtle"
          className="p-1.5"
          shadow
          edge
        >
          <LazyImage src={img.url} alt={img.alt} />
        </GlassLayer>
      ))}
    </div>
  );
}

/**
 * 渲染单条消息内容（文字 + 图片）
 */
function MessageContent({
  msg,
  isThinking,
}: {
  msg: ChatMessage;
  isThinking: boolean;
}) {
  // 提取 markdown 图片
  const { text, images } = extractImages(msg.content || '');

  // 兼容：如果 ChatMessage 上直接有 imageUrl 字段（预留 SSE 扩展）
  const extraImageUrl = (msg as ChatMessage & { imageUrl?: string }).imageUrl;
  const allImages = [
    ...images,
    ...(extraImageUrl ? [{ alt: '截图', url: extraImageUrl }] : []),
  ];

  if (text || allImages.length > 0) {
    return (
      <>
        {text && (
          <span>
            {text}
            {msg.streaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse-soft bg-accent align-middle" />
            )}
          </span>
        )}
        {!text && msg.streaming && allImages.length === 0 && (
          <span className="flex items-center gap-1.5 text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">
              {isThinking ? '时墨正在深度思考...' : '时墨正在思考...'}
            </span>
          </span>
        )}
        {allImages.length > 0 && <MessageImageCard images={allImages} />}
      </>
    );
  }

  if (msg.streaming) {
    return (
      <span className="flex items-center gap-1.5 text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs">
          {isThinking ? '时墨正在深度思考...' : '时墨正在思考...'}
        </span>
      </span>
    );
  }

  return null;
}

export default function HomeChatOverlay({
  open,
  initialMessage,
  onClose,
}: {
  open: boolean;
  initialMessage: string;
  onClose: () => void;
}) {
  const { messages, isStreaming, isThinking, error, sendMessage } = useSSEChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef(false);

  // 发送初始消息（仅一次）
  useEffect(() => {
    if (open && initialMessage && !sentRef.current) {
      sentRef.current = true;
      sendMessage(initialMessage);
    }
  }, [open, initialMessage, sendMessage]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="w-full sm:max-w-lg h-[85dvh] sm:h-75vh flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassLayer
              intensity="modal"
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-accent to-[var(--color-indigo)] flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-[var(--color-text-inverse)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text">时墨</h3>
                  <span className="text-xs text-text-muted">陪伴中</span>
                </div>
                <button
                  onClick={onClose}
                  aria-label="关闭"
                  className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-glass-hover transition-colors flex-shrink-0 focus-ring min-w-11 min-h-11 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scroll-smooth"
              >
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-80p rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user' ? 'msg-user' : 'msg-ai'
                      }`}
                    >
                      <MessageContent msg={msg} isThinking={isThinking} />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="px-4 py-2 text-xs text-error border-t border-error/30 bg-error/10 flex-shrink-0">
                  ⚠ {error}
                </div>
              )}

              {/* Input */}
              <div
                className="p-3 border-t border-border flex-shrink-0"
                style={{
                  paddingBottom: "calc(var(--space-md) + var(--safe-bottom))",
                }}
              >
                <div className="chat-input-shell">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="继续和时墨聊聊..."
                    aria-label="和时墨对话"
                    rows={1}
                    disabled={isStreaming}
                    className="chat-input-shell__textarea"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    aria-label="发送"
                    className="chat-input-shell__send"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </GlassLayer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
