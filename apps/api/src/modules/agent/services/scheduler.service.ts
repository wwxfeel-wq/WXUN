import { Injectable, Logger } from '@nestjs/common';
import { AgentPlanStep, AgentRuntimeInput, SSEActionData } from '@echolife/shared';

/**
 * Scheduler — determines execution order for plan steps, manages lightweight
 * async task scheduling, and detects proactive triggers based on time, event,
 * or emotion signals in the user input.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  /**
   * Topologically sort plan steps based on dependsOn.
   * Falls back to original order if cycles are detected.
   */
  schedule(steps: AgentPlanStep[]): AgentPlanStep[] {
    const map = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const temp = new Set<string>();
    const ordered: AgentPlanStep[] = [];

    const visit = (id: string) => {
      if (temp.has(id)) {
        this.logger.warn(`Cycle detected in plan at step ${id}, falling back to input order`);
        return;
      }
      if (visited.has(id)) return;

      const step = map.get(id);
      if (!step) return;

      temp.add(id);
      for (const dep of step.dependsOn ?? []) {
        visit(dep);
      }
      temp.delete(id);
      visited.add(id);
      ordered.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    // If topological sort dropped steps (cycle), fall back to input order.
    if (ordered.length !== steps.length) {
      return [...steps];
    }

    return ordered;
  }

  /**
   * Run an array of async tasks with a concurrency limit.
   */
  async runInParallel<T>(tasks: Array<() => Promise<T>>, concurrency = 3): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;

    const runNext = async (): Promise<void> => {
      const i = index++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
      await runNext();
    };

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () =>
      runNext(),
    );
    await Promise.all(workers);
    return results;
  }

  /**
   * Detect proactive tasks that should be triggered by time, event, or emotion
   * signals present in the user message or runtime state.
   *
   * Returns action events that the runtime can yield to the client; actual
   * execution is performed by background workers or the next runtime turn.
   */
  async detectProactiveTasks(
    input: AgentRuntimeInput,
    state: {
      agentType: string;
      emotion?: { emotion: string; intensity: number };
      fullResponse: string;
    },
  ): Promise<SSEActionData[]> {
    const tasks: SSEActionData[] = [];
    const message = input.message;

    // Time-based triggers
    const timeSignals = this.extractTimeSignals(message);
    if (timeSignals.length > 0) {
      tasks.push({
        action: 'proactive_time_trigger',
        status: 'success',
        detail: `检测到时间信号：${timeSignals.join('、')}`,
      });
    }

    // Event-based triggers (family events, reminders, trips, etc.)
    const eventSignals = this.extractEventSignals(message);
    if (eventSignals.length > 0) {
      tasks.push({
        action: 'proactive_event_trigger',
        status: 'success',
        detail: `检测到事件信号：${eventSignals.join('、')}`,
      });
    }

    // Emotion-based triggers: intense negative emotions may need follow-up
    if (state.emotion && this.isConcerningEmotion(state.emotion.emotion, state.emotion.intensity)) {
      tasks.push({
        action: 'proactive_emotion_followup',
        status: 'success',
        detail: `检测到需要关注的情绪：${state.emotion.emotion}（强度 ${state.emotion.intensity.toFixed(2)}）`,
      });
    }

    return tasks;
  }

  private extractTimeSignals(message: string): string[] {
    const signals: string[] = [];
    const patterns = [
      { regex: /(明天|后天|下周|下个月|周末|周一|周二|周三|周四|周五|周六|周日)/g, label: '相对日期' },
      { regex: /(\d{1,2}[:：]\d{2})/g, label: '时间点' },
      { regex: /(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/g, label: '具体日期' },
      { regex: /(早上|上午|中午|下午|晚上|凌晨)/g, label: '时段' },
    ];

    for (const p of patterns) {
      const matches = message.match(p.regex);
      if (matches && matches.length > 0) {
        signals.push(`${p.label}：${[...new Set(matches)].join('、')}`);
      }
    }

    return signals;
  }

  private extractEventSignals(message: string): string[] {
    const signals: string[] = [];
    const eventKeywords = [
      '生日', '聚会', '聚餐', '旅行', '旅游', '约会', '会议', '考试', '面试',
      '婚礼', '纪念日', '节日', '过年', '放假', '搬家', '装修', '去医院',
    ];

    for (const kw of eventKeywords) {
      if (message.includes(kw)) {
        signals.push(kw);
      }
    }

    return signals;
  }

  private isConcerningEmotion(emotion: string, intensity: number): boolean {
    if (intensity < 0.6) return false;
    const concerning = ['sadness', 'anger', 'fear', 'anxiety', 'stress', 'low', 'shame', 'guilt'];
    return concerning.includes(emotion.toLowerCase());
  }
}
