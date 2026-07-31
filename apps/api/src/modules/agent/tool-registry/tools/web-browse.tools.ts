import { Injectable, Logger } from '@nestjs/common';
import { WebSearchService } from '../../../ai/services/web-search.service';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/** 单个网页浏览结果 */
interface BrowsedPage {
  url: string;
  title: string;
  excerpt: string;
}

/** extract_user_info 返回的用户画像结构 */
interface UserInfoAnalysis {
  intent: string;
  emotion: string;
  suggestedDirection: string;
}

/** 常见情绪关键词，用于快速判断用户情绪倾向 */
const EMOTION_KEYWORDS: Array<[string, string]> = [
  ['开心', 'joy'],
  ['高兴', 'joy'],
  ['兴奋', 'joy'],
  ['难过', 'sadness'],
  ['伤心', 'sadness'],
  ['失落', 'sadness'],
  ['焦虑', 'anxiety'],
  ['紧张', 'anxiety'],
  ['担心', 'anxiety'],
  ['生气', 'anger'],
  ['愤怒', 'anger'],
  ['烦躁', 'anger'],
  ['压力大', 'stress'],
  ['累', 'tired'],
  ['疲惫', 'tired'],
  ['平静', 'calm'],
  ['感激', 'gratitude'],
  ['怀旧', 'nostalgia'],
  ['孤独', 'loneliness'],
  ['emo', 'low'],
];

/** 用户意图关键词模式 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  { pattern: /天气|气温|下雨|温度/, intent: '查询实时天气信息' },
  { pattern: /新闻|热点|今天发生|最新/, intent: '获取最新资讯' },
  { pattern: /怎么|如何|怎么办|怎么做|方法/, intent: '寻求解决方案或指导' },
  { pattern: /推荐|建议|有什么/, intent: '获取推荐建议' },
  { pattern: /是什么|什么叫|什么意思/, intent: '查询概念解释' },
  { pattern: /价格|多少钱|报价|费用/, intent: '查询价格信息' },
  { pattern: /攻略|旅游|行程/, intent: '获取攻略或行程规划' },
  { pattern: /菜谱|做法|食谱/, intent: '查找菜谱或做法' },
  { pattern: /记得|以前|上次|之前/, intent: '回忆过往记忆' },
  { pattern: /记录|记一下|帮我记/, intent: '记录保存信息' },
  { pattern: /提醒|待办|别忘了/, intent: '创建提醒待办' },
];

/** deep_research 深度对应的搜索与浏览数量 */
const DEPTH_CONFIG: Record<string, { maxResults: number; browseCount: number }> = {
  quick: { maxResults: 3, browseCount: 1 },
  standard: { maxResults: 5, browseCount: 2 },
  deep: { maxResults: 8, browseCount: 3 },
};

/** 网页正文最大字符数 */
const MAX_PAGE_CHARS = 50000;
/** HTTP 请求超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 10000;

/**
 * 网页浏览与研究 MCP 工具集。
 *
 * 提供网页内容抓取、深度研究、用户需求提取能力，让 Agent 能够
 * 主动浏览网络并理解用户隐含需求。
 */
@Injectable()
export class WebBrowseTools {
  private readonly logger = new Logger(WebBrowseTools.name);

  constructor(
    private readonly webSearchService: WebSearchService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [
      this.browseWebpage(),
      this.deepResearch(),
      this.extractUserInfo(),
    ];
  }

  // ============================================================
  // browse_webpage —— 浏览指定网页，提取正文内容
  // ============================================================

  private browseWebpage(): McpToolDefinition {
    return {
      name: 'browse_webpage',
      description: '浏览指定网页，提取标题与正文摘要，用于获取网页详细内容',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要浏览的网页 URL',
          },
          selector: {
            type: 'string',
            description: '可选的 CSS 选择器或关键词，用于定位正文区域（当前基于关键词过滤）',
          },
        },
        required: ['url'],
      },
      handler: async (args, ctx) => this.handleBrowseWebpage(args, ctx),
    };
  }

  private async handleBrowseWebpage(
    args: Record<string, unknown>,
    _ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const url = String(args.url ?? '').trim();
    if (!url) {
      return {
        tool: 'browse_webpage',
        success: false,
        summary: '请提供要浏览的网页 URL',
      };
    }

    if (!/^https?:\/\//i.test(url)) {
      return {
        tool: 'browse_webpage',
        success: false,
        summary: '请提供完整的 http(s) 网址',
      };
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; EchoLifeBot/1.0; +https://echolife.app)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });

      if (!response.ok) {
        return {
          tool: 'browse_webpage',
          success: false,
          summary: `网页请求失败：HTTP ${response.status}`,
        };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text') && !contentType.includes('html')) {
        return {
          tool: 'browse_webpage',
          success: false,
          summary: `不支持的网页内容类型：${contentType}`,
        };
      }

      const html = await response.text();
      const extracted = this.extractTextFromHtml(html, args.selector);

      return {
        tool: 'browse_webpage',
        success: true,
        summary: `已浏览网页「${extracted.title || url}」：${extracted.excerpt}`,
        data: {
          url,
          title: extracted.title,
          excerpt: extracted.excerpt,
          length: extracted.fullText.length,
        },
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`browse_webpage 失败 (${url})：${msg}`);
      return {
        tool: 'browse_webpage',
        success: false,
        summary: `浏览网页失败：${msg}`,
      };
    }
  }

  // ============================================================
  // deep_research —— 深度研究：搜索 + 浏览 + 总结
  // ============================================================

  private deepResearch(): McpToolDefinition {
    return {
      name: 'deep_research',
      description: '针对用户问题进行深度研究：先搜索网络，再浏览相关网页，最后综合生成研究摘要',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要研究的问题或关键词',
          },
          depth: {
            type: 'string',
            description: '研究深度：quick(快速) / standard(标准) / deep(深度)',
            enum: ['quick', 'standard', 'deep'],
            default: 'standard',
          },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => this.handleDeepResearch(args, ctx),
    };
  }

  private async handleDeepResearch(
    args: Record<string, unknown>,
    _ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        tool: 'deep_research',
        success: false,
        summary: '请提供研究问题或关键词',
      };
    }

    const depth = String(args.depth ?? 'standard') as keyof typeof DEPTH_CONFIG;
    const config = DEPTH_CONFIG[depth] ?? DEPTH_CONFIG.standard;

    try {
      // 第一步：使用 WebSearchService 搜索关键词
      const searchResult = await this.webSearchService.search(query, config.maxResults);

      if (searchResult.results.length === 0 && !searchResult.summary) {
        return {
          tool: 'deep_research',
          success: true,
          summary: `未找到与「${query}」相关的网络信息。`,
          data: { query, sources: [] },
        };
      }

      // 第二步：挑选最相关的若干链接进行浏览
      const candidateLinks = searchResult.results
        .filter((r) => r.url && /^https?:\/\//i.test(r.url))
        .slice(0, config.browseCount);

      const browsedPages: BrowsedPage[] = [];
      for (const result of candidateLinks) {
        const page = await this.safeBrowse(result.url);
        if (page) {
          browsedPages.push(page);
        }
      }

      // 第三步：综合搜索结果与网页内容生成研究摘要
      const findings = this.buildResearchFindings(query, searchResult, browsedPages);
      const sources = this.buildSourceList(searchResult, browsedPages);

      return {
        tool: 'deep_research',
        success: true,
        summary: findings,
        data: {
          query,
          depth,
          searchSummary: searchResult.summary,
          findings,
          sources,
          browsedCount: browsedPages.length,
        },
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`deep_research 失败 (${query})：${msg}`);
      return {
        tool: 'deep_research',
        success: false,
        summary: `深度研究失败：${msg}`,
      };
    }
  }

  // ============================================================
  // extract_user_info —— 从用户消息中提取隐含需求
  // ============================================================

  private extractUserInfo(): McpToolDefinition {
    return {
      name: 'extract_user_info',
      description: '分析用户消息，提取隐含的需求、意图与情绪状态，辅助 Agent 更好地理解用户',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '用户发送的原始消息',
          },
        },
        required: ['message'],
      },
      handler: async (args, ctx) => this.handleExtractUserInfo(args, ctx),
    };
  }

  private async handleExtractUserInfo(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const message = String(args.message ?? ctx.message ?? '').trim();
    if (!message) {
      return {
        tool: 'extract_user_info',
        success: false,
        summary: '请提供用户消息内容',
      };
    }

    try {
      const analysis = this.analyzeUserMessage(message);

      const summary =
        `用户意图：${analysis.intent}；` +
        `情绪状态：${analysis.emotion}；` +
        `建议回应方向：${analysis.suggestedDirection}`;

      return {
        tool: 'extract_user_info',
        success: true,
        summary,
        data: analysis,
      };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.warn(`extract_user_info 失败：${msg}`);
      return {
        tool: 'extract_user_info',
        success: false,
        summary: `用户需求提取失败：${msg}`,
      };
    }
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 从 HTML 中提取标题与正文纯文本。
   * 会移除 script / style 标签及其内容，并解码常见 HTML 实体。
   */
  private extractTextFromHtml(
    html: string,
    selector?: unknown,
  ): { title: string; excerpt: string; fullText: string } {
    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1]).trim() : '';

    // 移除 script / style / noscript / header / footer / nav 等非正文区域
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '');

    // 如果提供了选择器关键词，尝试定位包含该关键词的段落
    const selectorKeyword =
      typeof selector === 'string' && selector.trim() ? selector.trim() : '';

    // 移除所有 HTML 标签
    let text = cleaned.replace(/<[^>]+>/g, ' ');

    // 解码 HTML 实体
    text = this.decodeHtmlEntities(text);

    // 压缩空白字符
    text = text.replace(/\s+/g, ' ').trim();

    // 限制最大字符数
    if (text.length > MAX_PAGE_CHARS) {
      text = text.slice(0, MAX_PAGE_CHARS);
    }

    // 如果指定了关键词，提取关键词附近的上下文作为摘要
    let excerpt: string;
    if (selectorKeyword) {
      excerpt = this.extractContextAround(text, selectorKeyword, 600);
    } else {
      excerpt = text.slice(0, 600);
    }

    return { title, excerpt, fullText: text };
  }

  /**
   * 在文本中定位关键词，返回关键词前后一定范围的上下文。
   */
  private extractContextAround(text: string, keyword: string, windowSize: number): string {
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lowerText.indexOf(lowerKeyword);
    if (index === -1) {
      return text.slice(0, windowSize);
    }
    const half = Math.floor(windowSize / 2);
    const start = Math.max(0, index - half);
    const end = Math.min(text.length, index + keyword.length + half);
    return text.slice(start, end);
  }

  /**
   * 解码常见 HTML 实体为普通字符。
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&hellip;/g, '…')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }

  /**
   * 安全浏览网页，失败时返回 null 而不抛出异常。
   */
  private async safeBrowse(url: string): Promise<BrowsedPage | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; EchoLifeBot/1.0; +https://echolife.app)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });

      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text') && !contentType.includes('html')) {
        return null;
      }

      const html = await response.text();
      const extracted = this.extractTextFromHtml(html);
      return {
        url,
        title: extracted.title || url,
        excerpt: extracted.excerpt,
      };
    } catch (error) {
      this.logger.debug(`safeBrowse 跳过 ${url}：${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 综合搜索结果与已浏览网页内容，生成研究摘要与关键发现。
   */
  private buildResearchFindings(
    query: string,
    searchResult: { summary: string; results: Array<{ title: string; snippet: string; url: string }> },
    browsedPages: BrowsedPage[],
  ): string {
    const parts: string[] = [`【研究主题】${query}`, ''];

    // 搜索摘要
    if (searchResult.summary) {
      parts.push('【搜索摘要】', searchResult.summary, '');
    }

    // 关键发现 —— 来自搜索结果
    const searchFindings = searchResult.results
      .slice(0, 3)
      .map((r, i) => `${i + 1}. ${r.title}：${r.snippet}`)
      .filter((s) => s.trim().length > 3);
    if (searchFindings.length > 0) {
      parts.push('【搜索发现】', ...searchFindings, '');
    }

    // 关键发现 —— 来自网页正文
    const pageFindings = browsedPages
      .map((p, i) => `${i + 1}. 《${p.title}》：${p.excerpt}`)
      .filter((s) => s.trim().length > 3);
    if (pageFindings.length > 0) {
      parts.push('【网页正文发现】', ...pageFindings, '');
    }

    if (parts.length <= 2) {
      parts.push('暂未获取到有效研究内容。');
    }

    return parts.join('\n').slice(0, 4000);
  }

  /**
   * 构建信息来源列表，合并搜索结果与已浏览网页。
   */
  private buildSourceList(
    searchResult: { results: Array<{ title: string; url: string }> },
    browsedPages: BrowsedPage[],
  ): Array<{ title: string; url: string; browsed: boolean }> {
    const browsedUrls = new Set(browsedPages.map((p) => p.url));
    const sources: Array<{ title: string; url: string; browsed: boolean }> = [];

    for (const r of searchResult.results) {
      if (!r.url) continue;
      sources.push({
        title: r.title,
        url: r.url,
        browsed: browsedUrls.has(r.url),
      });
    }

    // 补充已浏览但未在搜索结果中的页面
    for (const p of browsedPages) {
      if (!sources.some((s) => s.url === p.url)) {
        sources.push({ title: p.title, url: p.url, browsed: true });
      }
    }

    return sources;
  }

  /**
   * 基于关键词模式分析用户消息，提取意图、情绪与建议回应方向。
   */
  private analyzeUserMessage(message: string): UserInfoAnalysis {
    // 识别用户意图
    let intent = '通用对话';
    for (const { pattern, intent: detected } of INTENT_PATTERNS) {
      if (pattern.test(message)) {
        intent = detected;
        break;
      }
    }

    // 识别情绪状态
    let emotion = 'neutral';
    for (const [keyword, emo] of EMOTION_KEYWORDS) {
      if (message.includes(keyword)) {
        emotion = emo;
        break;
      }
    }

    // 根据意图与情绪推断建议的回应方向
    const suggestedDirection = this.suggestResponseDirection(intent, emotion);

    return { intent, emotion, suggestedDirection };
  }

  /**
   * 根据用户意图与情绪，给出建议的回应方向。
   */
  private suggestResponseDirection(intent: string, emotion: string): string {
    // 情绪低落时优先共情安抚
    const lowEmotions = ['sadness', 'anxiety', 'anger', 'stress', 'tired', 'loneliness', 'low'];
    if (lowEmotions.includes(emotion)) {
      return '先共情安抚用户情绪，再结合实际需求给出温和建议';
    }

    // 根据意图给出方向
    const directionMap: Record<string, string> = {
      '查询实时天气信息': '调用网络搜索获取实时天气并给出生活建议',
      '获取最新资讯': '调用深度研究获取最新资讯并总结要点',
      '寻求解决方案或指导': '结合知识与网络搜索给出可操作的步骤建议',
      '获取推荐建议': '结合用户记忆偏好给出个性化推荐',
      '查询概念解释': '调用知识库或网络搜索解释概念',
      '查询价格信息': '调用网络搜索获取实时价格并对比',
      '获取攻略或行程规划': '结合记忆与网络搜索给出攻略建议',
      '查找菜谱或做法': '搜索菜谱并给出详细步骤',
      '回忆过往记忆': '检索用户长期记忆中相关内容',
      '记录保存信息': '提取关键信息并保存到记忆库',
      '创建提醒待办': '创建提醒并确认时间',
      '通用对话': '友好回应并主动了解用户更多需求',
    };

    return directionMap[intent] ?? '友好回应并主动了解用户更多需求';
  }
}
