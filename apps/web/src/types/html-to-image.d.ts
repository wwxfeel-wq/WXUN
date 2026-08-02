/**
 * html-to-image 类型声明（占位）
 * ─────────────────────────────────────────
 * 当 html-to-image 尚未安装时，提供最小类型声明使 TypeScript 编译通过。
 * 安装真实包后此声明会被覆盖，不影响功能。
 */

declare module 'html-to-image' {
  export interface ToPngOptions {
    backgroundColor?: string;
    pixelRatio?: number;
    cacheBust?: boolean;
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
    quality?: number;
    filter?: (node: HTMLElement) => boolean;
    [key: string]: unknown;
  }

  export function toPng(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<string>;

  export function toJpeg(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<string>;

  export function toSvg(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<string>;

  export function toCanvas(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<HTMLCanvasElement>;

  export function toBlob(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<Blob>;

  export function toPixelData(
    node: HTMLElement,
    options?: ToPngOptions,
  ): Promise<Uint8ClampedArray>;
}
