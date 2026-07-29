'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  X,
  Loader2,
  Sparkles,
  Zap,
  Wrench,
  Brain,
  Cloud,
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ListTodo,
} from 'lucide-react';
import {
  useFamilyHubStore,
  type AgentRuntime,
  type InvokeAgentResult,
  type AgentToolResult,
  type WorkflowResult,
} from '@/stores/family-hub-store';
import { GlassLayer } from '@/components/glass';

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  result?: InvokeAgentResult;
}

interface AgentChatModalProps {
  agent: AgentRuntime | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Agent Chat Modal — lets the user have a real AI conversation with an agent.
 * Calls POST /family-hub/agents/:code/invoke which routes through the LLM adapter.
 * Displays execution status, tool calls, and workflow steps inline.
 */
export default function AgentChatModal({ agent, open, onClose }: AgentChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [skillNotice, setSkillNotice] = useState<
    | null
    | {
        type: 'levelup' | 'exp';
        skillName?: string;
        level?: number;
        exp?: number;
      }
  >(null);
  const [showDetails, setShowDetails] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const invokeAgent = useFamilyHubStore((s) => s.invokeAgent);

  // Auto-dismiss skill level-up / exp notice
  useEffect(() => {
    if (!skillNotice) return;
    const timer = setTimeout(() => setSkillNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [skillNotice]);

  // Reset conversation when agent changes
  const agentId = agent?.id;
  const welcomeMessage = agent?.welcomeMessage;
  const agentName = agent?.name;
  const agentRole = agent?.role;
  useEffect(() => {
    if (agent && open) {
      setMessages([
        {
          role: 'agent',
          content: welcomeMessage || `你好！我是${agentName}（${agentRole}）。有什么我可以帮你的吗？`,
          timestamp: Date.now(),
        },
      ]);
      setInput('');
      setLoading(false);
      setExecuting(false);
      setShowDetails(false);
    }
  }, [agent, agentId, open, welcomeMessage, agentName, agentRole]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showDetails]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !agent || loading) return;

    const userMessage = input.trim();
    setInput('');

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: Date.now() },
    ]);

    setLoading(true);
    setExecuting(true);

    try {
      const result = await invokeAgent(agent.id, userMessage);

      if (result.leveledUp && result.skillName) {
        setSkillNotice({
          type: 'levelup',
          skillName: result.skillName,
          level: result.skillLevel,
        });
      } else if ((result.expGained ?? 0) > 0) {
        setSkillNotice({
          type: 'exp',
          skillName: result.skillName,
          exp: result.expGained,
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: result.response,
          timestamp: Date.now(),
          result,
        },
      ]);

      // Auto-expand execution details if tools or workflows ran
      if (
        (result.toolResults && result.toolResults.length > 0) ||
        (result.workflowResults && result.workflowResults.length > 0)
      ) {
        setShowDetails(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: '抱歉，我遇到了一些问题。请稍后再试。',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      setExecuting(false);
    }
  }, [input, agent, loading, invokeAgent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!agent) return null;

  const lastResult = [...messages].reverse().find((m) => m.result)?.result;
  const hasDetails =
    lastResult &&
    ((lastResult.toolResults && lastResult.toolResults.length > 0) ||
      (lastResult.workflowResults && lastResult.workflowResults.length > 0));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm"
          role="button"
          aria-label="关闭"
          tabIndex={0}
          onClick={onClose}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
        >
          <GlassLayer
            intensity="modal"
            className="w-full max-w-2xl h-75vh flex flex-col overflow-hidden"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex flex-col h-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${agent.color || 'var(--color-secondary)'} 12%, transparent)`,
                }}
              >
                <Sparkles
                  className="w-5 h-5"
                  style={{ color: agent.color || 'var(--color-secondary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text truncate">
                  {agent.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">{agent.role}</span>
                  <span className="text-3xs text-text-subtle">
                    Lv.{agent.level} · {agent.calls} 次调用
                  </span>
                </div>
              </div>
              {agent.capabilities && agent.capabilities.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-50">
                  {agent.capabilities.slice(0, 2).map((cap) => (
                    <span
                      key={cap}
                      className="text-3xs px-2 py-0.5 rounded-full bg-glass text-text-muted"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={onClose}
                aria-label="关闭"
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-glass-hover transition-colors flex-shrink-0 focus-ring"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Skill level-up / exp notice */}
            <AnimatePresence mode="wait">
              {skillNotice && (
                <GlassLayer
                  intensity="strong"
                  className="mx-4 mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-lg"
                >
                  <motion.div
                    key={skillNotice.type}
                    initial={{ opacity: 0, y: -12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="flex items-center gap-2.5 w-full"
                  >
                    {skillNotice.type === 'levelup' ? (
                    <>
                      <Sparkles className="w-4 h-4 text-highlight flex-shrink-0" />
                      <span className="text-sm font-semibold text-text truncate">
                        {skillNotice.skillName} 升级到 Lv.{skillNotice.level}
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-success flex-shrink-0" />
                      <span className="text-sm text-text truncate">
                        {skillNotice.skillName
                          ? `+${skillNotice.exp} EXP · ${skillNotice.skillName}`
                          : `+${skillNotice.exp} EXP`}
                      </span>
                    </>
                  )}
                </motion.div>
              </GlassLayer>
            )}
            </AnimatePresence>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
            >
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-85p rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' ? 'msg-user' : 'msg-ai'
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-glass rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
                    <span className="text-xs text-text-muted">
                      {executing ? `${agent.name} 正在调用工具并思考...` : `${agent.name} 正在思考...`}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Execution details */}
              {hasDetails && (
                <ExecutionDetails
                  result={lastResult!}
                  show={showDetails}
                  onToggle={() => setShowDetails((s) => !s)}
                />
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`和 ${agent.role} 对话...`}
                  aria-label={`和 ${agent.role} 对话`}
                  rows={1}
                  disabled={loading}
                  className="flex-1 bg-glass border border-glass-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-text-subtle resize-none focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-[var(--state-disabled-opacity)] focus-ring max-h-25"
                />
                <GlassLayer
                  intensity="default"
                  interactive
                  asChild
                  className="flex-shrink-0 w-10 h-10 rounded-xl text-accent flex items-center justify-center disabled:opacity-[var(--state-disabled-opacity)] hover:text-accent-hover transition-colors focus-ring"
                >
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    aria-label="发送"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </GlassLayer>
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-3xs text-text-subtle">
                <Zap className="w-3 h-3" />
                <span>真实 AI 对话 · 按下 Enter 发送 · Shift+Enter 换行</span>
              </div>
            </div>
            </motion.div>
          </GlassLayer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Collapsible execution details panel showing tool calls and workflow steps.
 */
function ExecutionDetails({
  result,
  show,
  onToggle,
}: {
  result: InvokeAgentResult;
  show: boolean;
  onToggle: () => void;
}) {
  const toolCount = result.toolResults?.length ?? 0;
  const workflowCount = result.workflowResults?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-glass border border-glass-border rounded-2xl overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-muted hover:text-text hover:bg-glass-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          <span>
            执行详情
            {toolCount > 0 && ` · ${toolCount} 个工具`}
            {workflowCount > 0 && ` · ${workflowCount} 个工作流`}
            {result.tokensUsed ? ` · ${result.tokensUsed} tokens` : ''}
          </span>
        </div>
        {show ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3">
              {result.filtered && (
                <div className="text-2xs text-text-muted bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                  消息已被过滤（{result.filterReason}），未调用 AI。
                </div>
              )}

              {/* Tool results */}
              {result.toolResults && result.toolResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-2xs font-medium text-text-secondary">
                    <Wrench className="w-3 h-3" />
                    <span>工具调用</span>
                  </div>
                  {result.toolResults.map((tool, idx) => (
                    <ToolResultItem key={`${tool.tool}-${idx}`} tool={tool} />
                  ))}
                </div>
              )}

              {/* Workflow results */}
              {result.workflowResults && result.workflowResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-2xs font-medium text-text-secondary">
                    <Brain className="w-3 h-3" />
                    <span>工作流执行</span>
                  </div>
                  {result.workflowResults.map((wf, idx) => (
                    <WorkflowResultItem key={`${wf.workflow}-${idx}`} workflow={wf} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ToolResultItem({ tool }: { tool: AgentToolResult }) {
  const icon = getToolIcon(tool.tool);
  return (
    <div className="text-2xs bg-glass-hover border border-glass-border rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="font-medium text-text">{tool.tool}</span>
        {tool.success ? (
          <CheckCircle2 className="w-3 h-3 text-success" />
        ) : (
          <XCircle className="w-3 h-3 text-error" />
        )}
      </div>
      <p className="text-text-secondary leading-relaxed">{tool.summary}</p>
    </div>
  );
}

function WorkflowResultItem({ workflow }: { workflow: WorkflowResult }) {
  return (
    <div className="text-2xs bg-glass-hover border border-glass-border rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <ListTodo className="w-3 h-3 text-secondary" />
        <span className="font-medium text-text">{workflow.workflow}</span>
      </div>
      <div className="space-y-1.5">
        {workflow.steps.map((step) => (
          <div key={step.name} className="flex items-start gap-2">
            <StepStatusIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <div className="text-text-secondary">{step.name}</div>
              {step.detail && (
                <div className="text-text-muted truncate">{step.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {workflow.output && (
        <p className="mt-2 text-text-muted leading-relaxed line-clamp-3">
          {workflow.output}
        </p>
      )}
    </div>
  );
}

function StepStatusIcon({ status }: { status: WorkflowResult['steps'][number]['status'] }) {
  if (status === 'success') return <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />;
  if (status === 'failed') return <XCircle className="w-3 h-3 text-error mt-0.5" />;
  if (status === 'running') return <Loader2 className="w-3 h-3 text-secondary animate-spin mt-0.5" />;
  return <div className="w-3 h-3 rounded-full border border-text-muted mt-0.5" />;
}

function getToolIcon(toolName: string) {
  if (toolName.includes('weather')) return <Cloud className="w-3 h-3 text-info" />;
  if (toolName.includes('search')) return <Search className="w-3 h-3 text-secondary" />;
  if (toolName.includes('memory') || toolName.includes('emotion')) return <Brain className="w-3 h-3 text-highlight" />;
  return <Wrench className="w-3 h-3 text-text-muted" />;
}
