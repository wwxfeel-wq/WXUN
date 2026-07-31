/**
 * Emotion Store (Zustand)
 * ─────────────────────────────────────────────────────────────
 * 全局情感状态 store — 让 EmotionWaveBar 和 consciousness-panel
 * 共享同一份数据源，实现波形常驻显示与实时联动。
 *
 * consciousness-panel 在生命核心页面更新 state/activity，
 * EmotionWaveBar 在全局顶部订阅并实时渲染波形。
 */
import { create } from 'zustand';

export type EmotionState = 'companion' | 'learning' | 'recalling' | 'growing';

interface EmotionStore {
  /** 当前情感状态 */
  state: EmotionState;
  /** 意识活跃度 0-100 */
  activity: number;
  /** 更新情感状态 */
  setState: (state: EmotionState) => void;
  /** 更新活跃度 */
  setActivity: (activity: number) => void;
}

export const useEmotionStore = create<EmotionStore>((set) => ({
  state: 'companion',
  activity: 67,
  setState: (newState) => set({ state: newState }),
  setActivity: (newActivity) =>
    set({ activity: Math.max(0, Math.min(100, newActivity)) }),
}));
