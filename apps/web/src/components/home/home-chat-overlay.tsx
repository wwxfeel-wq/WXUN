'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2, Sparkles } from 'lucide-react';
import { useSSEChat } from '@/hooks/use-sse-chat';
import { GlassLayer } from '@/components/glass';

/**
 * HomeChatOverlay — 首页浮动聊天面板
 * ─────────────────────────────────────────
 * 用户在首页输入框发送消息后，弹出此面板展示时墨的流式回复。
 * 使用与倾诉页相同的 SSE 流式接口，保持一致的聊天体验。
 */
export default function HomeChatOverlay({
  open,
  initialMessage,
  onClose,
}: {
  open: boolean;
  initialMessage: string;
  onClose: () => void;
}) {
  const { messages, isStreaming, error, sendMessage } = useSSEChat();
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
            className="w-full sm:max-w-lg h-75vh flex flex-col"
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
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-glass-hover transition-colors flex-shrink-0 focus-ring"
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
                      {msg.content ? (
                        <span>
                          {msg.content}
                          {msg.streaming && (
                            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse-soft bg-accent align-middle" />
                          )}
                        </span>
                      ) : msg.streaming ? (
                        <span className="flex items-center gap-1.5 text-text-muted">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="text-xs">时墨正在思考...</span>
                        </span>
                      ) : null}
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
              <div className="p-3 border-t border-border flex-shrink-0">
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
