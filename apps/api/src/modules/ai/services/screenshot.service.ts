import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import { isSafeUrl } from '../../common/utils/ssrf-guard.util';

/** 截图请求选项 */
export interface ScreenshotOptions {
  /** 是否截取整页（含滚动区域） */
  fullPage?: boolean;
  /** 视口宽度，默认 1280 */
  width?: number;
  /** 视口高度，默认 720 */
  height?: number;
  /** 导航超时（毫秒），默认 10000 */
  timeout?: number;
}

/** 截图缓存条目 */
interface ScreenshotCacheEntry {
  data: string;
  timestamp: number;
}

/** 缓存有效期（毫秒）：5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** 默认视口与超时 */
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_TIMEOUT_MS = 10000;

/** 常见系统 Chromium / Chrome 可执行路径（按优先级） */
const DEFAULT_EXECUTABLE_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/**
 * ScreenshotService — 基于 puppeteer-core 的网页截图服务。
 *
 * 设计要点：
 * - 使用 puppeteer-core（不内置 Chromium），连接系统安装的 Chrome / Edge。
 * - 可执行路径优先取环境变量 PUPPETEER_EXECUTABLE_PATH / CHROME_PATH，
 *   否则按常见路径探测。
 * - 截图结果以 Base64 PNG 返回，并按 URL 缓存 5 分钟。
 * - 若 puppeteer 启动失败，返回 null 并记录警告，绝不抛出异常，
 *   保证不阻塞 AI 对话主流程。
 */
@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);
  private readonly executablePath: string | undefined;
  private readonly cache = new Map<string, ScreenshotCacheEntry>();

  constructor(private readonly configService: ConfigService) {
    this.executablePath =
      this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') ??
      this.configService.get<string>('CHROME_PATH') ??
      this.detectExecutablePath();
  }

  /**
   * 捕获网页截图，返回 Base64 编码的 PNG（不含 data: 前缀）。
   * 失败时返回 null 并记录警告。
   */
  async captureWebpage(
    url: string,
    options: ScreenshotOptions = {},
  ): Promise<string | null> {
    if (!url || !/^https?:\/\//i.test(url)) {
      this.logger.warn(`captureWebpage 跳过非法 URL：${url}`);
      return null;
    }

    // SSRF 防护：阻止内网地址与元数据端点
    if (!isSafeUrl(url)) {
      this.logger.warn(`captureWebpage URL 被 SSRF 防护拦截：${url}`);
      return null;
    }

    // 命中缓存直接返回
    const cached = this.getFromCache(url);
    if (cached) return cached;

    const executablePath = this.executablePath;
    if (!executablePath) {
      this.logger.warn(
        '未找到系统 Chromium / Chrome 可执行路径，截图服务不可用。' +
          '请设置 PUPPETEER_EXECUTABLE_PATH 环境变量或安装 Chrome。',
      );
      return null;
    }

    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      const width = options.width ?? DEFAULT_VIEWPORT_WIDTH;
      const height = options.height ?? DEFAULT_VIEWPORT_HEIGHT;
      const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

      await page.setViewport({ width, height });
      page.setDefaultTimeout(timeout);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      const buffer = await page.screenshot({
        type: 'png',
        fullPage: options.fullPage ?? false,
        encoding: 'base64',
      });

      // encoding='base64' 时 puppeteer 返回 string
      const base64 = typeof buffer === 'string' ? buffer : buffer.toString('base64');

      this.setCache(url, base64);
      this.logger.debug(`截图成功：${url} (${width}x${height})`);
      return base64;
    } catch (error) {
      this.logger.warn(
        `网页截图失败 (${url})：${(error as Error).message}`,
      );
      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // 关闭失败可忽略
        }
      }
    }
  }

  /** 释放缓存（测试 / 模块销毁时使用） */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /** 读取有效缓存，过期则删除并返回 undefined */
  private getFromCache(url: string): string | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(url);
      return null;
    }
    return entry.data;
  }

  /** 写入缓存 */
  private setCache(url: string, data: string): void {
    this.cache.set(url, { data, timestamp: Date.now() });
  }

  /** 探测常见系统 Chrome / Chromium 路径（按优先级返回首个存在的） */
  private detectExecutablePath(): string | undefined {
    // 按平台过滤候选路径，避免在 Windows 上返回 Linux 路径
    const isWindows = process.platform === 'win32';
    const candidates = DEFAULT_EXECUTABLE_PATHS.filter((p) =>
      isWindows ? p.includes('\\') : !p.includes('\\'),
    );
    for (const candidate of candidates) {
      try {
        if (existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // 忽略权限/访问异常，继续探测下一个
      }
    }
    return undefined;
  }
}
