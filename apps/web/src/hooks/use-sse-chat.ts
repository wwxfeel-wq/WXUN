'use client';

/**
 * useSSEChat - React hook for SSE-streaming AI interview chat.
 *
 * Manages a local message list, streaming state, and exposes sendMessage /
 * stopStream controls. Handles token, entities, emotion, done and error
 * events emitted by the backend /ai/chat endpoint.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { createSSEStream, type SSEHandle } from '@/lib/api-client';
import type { ChatMessage } from '@/lib/types';

const MAX_MESSAGE_LENGTH = 2000;
const EMPTY_MESSAGES: ChatMessage[] = [];

export interface UseSSEChatOptions {
  /** Optional interview session id to scope the conversation. */
  interviewId?: string;
  /** Initial messages (e.g. loaded from history). */
  initialMessages?: ChatMessage[];
}

export interface SkillNotice {
  type: 'exp' | 'levelup';
  skillName: string;
  exp?: number;
  level?: number;
  agentCode?: string;
}

export interface UseSSEChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  error: string | null;
  skillNotice: SkillNotice | null;
  /** Send a user message and stream the AI reply. */
  sendMessage: (content: string) => void;
  /** Abort the current stream. */
  stopStream: () => void;
  /** Clear all messages and reset error state. */
  clearMessages: () => void;
  /** Replace the message list (e.g. when loading a session). */
  setMessages: (messages: ChatMessage[]) => void;
}

export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const { interviewId, initialMessages = EMPTY_MESSAGES } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillNotice, setSkillNotice] = useState<SkillNotice | null>(null);

  const streamRef = useRef<SSEHandle | null>(null);
  const interviewIdRef = useRef<string | undefined>(interviewId);
  const stoppedRef = useRef(false);
  const errorOccurredRef = useRef(false);

  useEffect(() => {
    interviewIdRef.current = interviewId;
  }, [interviewId]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      streamRef.current?.abort();
    };
  }, []);

  // Auto-dismiss skill level-up / exp notice
  useEffect(() => {
    if (!skillNotice) return;
    const timer = setTimeout(() => setSkillNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [skillNotice]);

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!trimmed || isStreaming) return;

      stoppedRef.current = false;
      errorOccurredRef.current = false;
      setError(null);

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };

      const aiMessageId = nanoid();
      const aiPlaceholder: ChatMessage = {
        id: aiMessageId,
        role: 'ai',
        content: '',
        createdAt: Date.now(),
        streaming: true,
      };

      setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
      setIsStreaming(true);

      const handle = createSSEStream('/ai/chat', {
        message: trimmed,
        interviewId: interviewIdRef.current,
      }, {
        onReasoning: (content: string) => {
          // DeepSeek V4 thinking mode: model is reasoning before answering
          setIsThinking(true);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              reasoning: (next[idx].reasoning || '') + content,
            };
            return next;
          });
        },
        onToken: (token) => {
          // First content token means thinking is done
          setIsThinking(false);
          if (!token || !token.trim()) return;
          // Use setMessages with a callback to always append to the LATEST
          // state, avoiding stale messagesRef race conditions where tokens
          // arriving in quick succession would overwrite each other.
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              content: next[idx].content + token,
              streaming: true,
            };
            return next;
          });
        },
        onEntities: (entities) => {
          if (errorOccurredRef.current) return;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], entities, streaming: true };
            return next;
          });
        },
        onEmotion: (emotion, intensity) => {
          if (errorOccurredRef.current) return;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              emotion,
              emotionIntensity: intensity,
              streaming: true,
            };
            return next;
          });
        },
        onToolCall: (tool, args) => {
          if (errorOccurredRef.current) return;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            const existing = next[idx].toolCalls ?? [];
            next[idx] = {
              ...next[idx],
              toolCalls: [...existing, { tool, args }],
              streaming: true,
            };
            return next;
          });
        },
        onObservation: (data) => {
          if (errorOccurredRef.current) return;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            const calls = [...(next[idx].toolCalls ?? [])];
            // 更新最后一个未完成的工具调用
            for (let i = calls.length - 1; i >= 0; i--) {
              if (calls[i].success === undefined) {
                calls[i] = {
                  ...calls[i],
                  success: data.success,
                  summary: data.summary,
                };
                break;
              }
            }
            next[idx] = { ...next[idx], toolCalls: calls, streaming: true };
            return next;
          });
        },
        onSkillExp: (skillName, expGained, agentCode) => {
          setSkillNotice({ type: 'exp', skillName, exp: expGained, agentCode });
        },
        onSkillLevelUp: (skillName, level, agentCode) => {
          setSkillNotice({ type: 'levelup', skillName, level, agentCode });
        },
        onDone: (data) => {
          setIsThinking(false);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              streaming: false,
              memoryId: data.memoryId,
              summary: data.summary,
              emotion: data.emotion ?? next[idx].emotion,
            };
            return next;
          });
          setIsStreaming(false);
        },
        onError: (message) => {
          errorOccurredRef.current = true;
          setIsThinking(false);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              streaming: false,
              content: next[idx].content || `[回复失败] ${message}`,
            };
            return next;
          });
          setError(message);
          setIsStreaming(false);
        },
        onClose: () => {
          if (stoppedRef.current) {
            streamRef.current = null;
            return;
          }
          setIsThinking(false);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMessageId);
            if (idx === -1) return prev;
            if (!prev[idx].streaming) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], streaming: false };
            return next;
          });
          setIsStreaming(false);
          streamRef.current = null;
        },
      });

      streamRef.current = handle;
    },
    [isStreaming],
  );

  const stopStream = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.abort();
    streamRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
    // Mark any still-streaming message as finalized.
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setSkillNotice(null);
  }, []);

  const setMessagesExternal = useCallback((next: ChatMessage[]) => {
    setMessages(next);
  }, []);

  return {
    messages,
    isStreaming,
    isThinking,
    error,
    skillNotice,
    sendMessage,
    stopStream,
    clearMessages,
    setMessages: setMessagesExternal,
  };
}
