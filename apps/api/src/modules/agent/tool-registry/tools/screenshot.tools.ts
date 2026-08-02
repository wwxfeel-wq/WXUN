import { Injectable, Logger } from '@nestjs/common';
import { ScreenshotService } from '../../../ai/services/screenshot.service';
import { WebSearchService } from '../../../ai/services/web-search.service';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/** 默认截图视口宽度 */
const DEFAULT_WIDTH = 1280;
/** 默认截图视口高度 */
const DEFAULT_HEIGHT = 720;

/**
 * 网页截图 MCP 工具集。
 *
 * 让 Agent 具备「看见网页」的能力：
 * - screenshot_webpage：对指定 URL 截图，返回可直接渲染的 data URI 图片。
 * - screenshot_search：对搜索关键词，先搜索再对首个结果截图。
 *
 * 截图服务失败时会优雅降级（返回 success=false 的提示），绝不阻塞 AI 对话。
 */
@Injectable()
export class ScreenshotTools {
  private readonly logger = new Logger(ScreenshotTools.name);

  constructor(
    private readonly screenshotService: ScreenshotService,
    private readonly webSearchService: WebSearchService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [this.screenshotWebpage(), this.screenshotSearch()];
  }

  // ============================================================
  // screenshot_webpage —— 对指定网页截图
  // ============================================================

  private screenshotWebpage(): McpToolDefinition {
    return {
      name: 'screenshot_webpage',
      description: '对指定网页进行截图，返回可直接渲染的 PNG 图片（data URI）',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要截图的网页 URL',
          },
          fullPage: {
            type: 'boolean',
            description: '是否截取整页（含滚动区域），默认 false',
          },
        },
        required: ['url'],
      },
      handler: async (args, ctx) => this.handleScreenshotWebpage(args, ctx),
    };
  }

  private async handleScreenshotWebpage(
    args: Record<string, unknown>,
    _ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const url = String(args.url ?? '').trim();
    if (!url) {
      return {
        tool: 'screenshot_webpage',
        success: false,
        summary: '请提供要截图的网页 URL',
      };
    }

    if (!/^https?:\/\//i.test(url)) {
      return {
        tool: 'screenshot_webpage',
        success: false,
        summary: '请提供完整的 http(s) 网址',
      };
    }

    const fullPage = args.fullPage === true;
    try {
      const base64 = await this.screenshotService.captureWebpage(url, {
        fullPage,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      });

      if (!base64) {
        return {
          tool: 'screenshot_webpage',
          success: false,
          summary:
            '截图服务暂不可用（系统未安装 Chromium 或启动失败），请稍后再试。',
        };
      }

      const imageUrl = `data:image/png;base64,${base64}`;
      return {
        tool: 'screenshot_webpage',
        success: true,
        summary: `已截取网页「${url}」的屏幕截图`,
        data: {
          imageUrl,
          url,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          fullPage,
        },
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`screenshot_webpage 失败 (${url})：${msg}`);
      return {
        tool: 'screenshot_webpage',
        success: false,
        summary: `网页截图失败：${msg}`,
      };
    }
  }

  // ============================================================
  // screenshot_search —— 搜索关键词并对首个结果截图
  // ============================================================

  private screenshotSearch(): McpToolDefinition {
    return {
      name: 'screenshot_search',
      description: '搜索关键词并对首个相关网页进行截图，返回搜索摘要与截图',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要搜索并截图的关键词',
          },
          fullPage: {
            type: 'boolean',
            description: '是否截取整页（含滚动区域），默认 false',
          },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => this.handleScreenshotSearch(args, ctx),
    };
  }

  private async handleScreenshotSearch(
    args: Record<string, unknown>,
    _ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        tool: 'screenshot_search',
        success: false,
        summary: '请提供搜索关键词',
      };
    }

    try {
      // 第一步：搜索
      const searchResult = await this.webSearchService.search(query, 3);

      const firstUrl = searchResult.results.find(
        (r) => r.url && /^https?:\/\//i.test(r.url),
      )?.url;

      if (!firstUrl) {
        return {
          tool: 'screenshot_search',
          success: false,
          summary: `未找到与「${query}」相关的可截图网页`,
          data: { query, searchSummary: searchResult.summary },
        };
      }

      // 第二步：对首个结果截图
      const fullPage = args.fullPage === true;
      const base64 = await this.screenshotService.captureWebpage(firstUrl, {
        fullPage,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      });

      if (!base64) {
        return {
          tool: 'screenshot_search',
          success: true,
          summary: `已搜索「${query}」，但截图服务暂不可用。${searchResult.summary}`,
          data: {
            query,
            url: firstUrl,
            searchSummary: searchResult.summary,
            results: searchResult.results,
          },
        };
      }

      const imageUrl = `data:image/png;base64,${base64}`;
      return {
        tool: 'screenshot_search',
        success: true,
        summary: `已搜索「${query}」并截取首个结果「${firstUrl}」的屏幕截图`,
        data: {
          imageUrl,
          query,
          url: firstUrl,
          searchSummary: searchResult.summary,
          results: searchResult.results,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        },
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`screenshot_search 失败 (${query})：${msg}`);
      return {
        tool: 'screenshot_search',
        success: false,
        summary: `搜索截图失败：${msg}`,
      };
    }
  }
}
