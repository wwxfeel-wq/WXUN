'use client';

/**
 * EchoLife 前端截图工具
 * ─────────────────────────────────────────
 * 基于 html-to-image 库（纯前端），将 DOM 元素截图为 Base64 PNG data URL。
 * 用于 Life Core 心跳画布、ECG 意识面板等可视化组件的截图分享。
 */
import { toPng } from 'html-to-image';

/** 截图选项：透明背景、2x 像素密度、绕过缓存 */
const CAPTURE_OPTIONS = {
  backgroundColor: 'transparent',
  pixelRatio: 2,
  cacheBust: true,
} as const;

/**
 * 截取指定 DOM 元素为 Base64 PNG data URL。
 *
 * @param elementId - 目标元素的 id
 * @returns 成功时返回 `data:image/png;base64,...`；失败时返回 null 并 console.warn
 */
export async function captureElement(elementId: string): Promise<string | null> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`[capture] 未找到元素 #${elementId}`);
      return null;
    }
    const dataUrl = await toPng(element, CAPTURE_OPTIONS);
    return dataUrl;
  } catch (error) {
    console.warn(`[capture] 截图元素 #${elementId} 失败:`, error);
    return null;
  }
}

/**
 * 截取 Life Core 心跳画布。
 * 查找 id 为 'life-core-canvas' 或 class 为 '.life-core-canvas' 的元素。
 *
 * @returns Base64 PNG data URL 或 null
 */
export async function captureLifeCore(): Promise<string | null> {
  try {
    const element =
      document.getElementById('life-core-canvas') ??
      document.querySelector<HTMLElement>('.life-core-canvas');
    if (!element) {
      console.warn('[capture] 未找到 Life Core 画布元素');
      return null;
    }
    const dataUrl = await toPng(element, CAPTURE_OPTIONS);
    return dataUrl;
  } catch (error) {
    console.warn('[capture] 截图 Life Core 失败:', error);
    return null;
  }
}

/**
 * 截取 ECG 意识面板。
 * 查找 id 为 'consciousness-panel' 或 class 为 '.consciousness-panel' 的元素。
 *
 * @returns Base64 PNG data URL 或 null
 */
export async function captureECG(): Promise<string | null> {
  try {
    const element =
      document.getElementById('consciousness-panel') ??
      document.querySelector<HTMLElement>('.consciousness-panel');
    if (!element) {
      console.warn('[capture] 未找到 ECG 意识面板元素');
      return null;
    }
    const dataUrl = await toPng(element, CAPTURE_OPTIONS);
    return dataUrl;
  } catch (error) {
    console.warn('[capture] 截图 ECG 意识面板失败:', error);
    return null;
  }
}
