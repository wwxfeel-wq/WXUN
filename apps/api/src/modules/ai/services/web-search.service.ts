import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResult {
  query: string;
  results: SearchResult[];
  summary: string;
  source: string;
}

/**
 * WebSearchService — provides real-time web search capability.
 *
 * Strategy:
 * 1. If TAVILY_API_KEY is set, use Tavily (AI-optimized, best quality)
 * 2. Otherwise, use DuckDuckGo Instant Answer API (free, no key needed)
 *
 * Used by AgentOrchestrator to inject real-time context when user asks
 * about weather, news, current events, stock prices, etc.
 */
@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly tavilyKey: string | null;

  /** Keywords that indicate the user is asking about real-time information */
  private static readonly REALTIME_PATTERNS = [
    // Weather
    /天气|气温|温度|下雨|下雪|刮风|台风|雾霾|空气质量|aqi/i,
    // News / current events
    /新闻|热点|今日|今天|最新|最近|发生了什么|热搜/i,
    // Time / date
    /几点了|现在时间|今天日期|今天几号|星期几/i,
    // Finance
    /股票|基金|汇率|金价|油价|比特币|crypto|btc|eth/i,
    // Sports
    /比分|赛果|赛程|联赛|世界杯|奥运|nba|cba/i,
    // Tech / products
    /发布|上市|新版本|更新|release|发布会/i,
    // General "what's happening"
    /现在.*怎么样|目前.*如何|最新.*情况|实时/i,
  ];

  constructor(private readonly configService: ConfigService) {
    this.tavilyKey = this.configService.get<string>('TAVILY_API_KEY') ?? null;
  }

  /**
   * Detects whether a user message is asking about real-time information.
   * Returns the extracted search query if so, null otherwise.
   */
  detectRealtimeQuery(message: string): string | null {
    // Quick check against patterns
    const matches = WebSearchService.REALTIME_PATTERNS.some((p) =>
      p.test(message),
    );
    if (!matches) return null;

    // Extract a clean search query from the message
    // Remove filler words and keep the core question
    let query = message
      .replace(/^(我想知道|请问|帮我查|查一下|告诉我|你知道|想了解)/g, '')
      .replace(/[？?！!。.，,]+$/g, '')
      .trim();

    // If the message is too generic, use it as-is
    if (query.length < 2) {
      query = message.trim();
    }

    return query;
  }

  /**
   * Performs a web search and returns results.
   */
  async search(query: string, maxResults = 5): Promise<WebSearchResult> {
    if (this.tavilyKey) {
      try {
        return await this.searchWithTavily(query, maxResults);
      } catch (err) {
        this.logger.warn(
          `Tavily search failed, falling back to DuckDuckGo: ${(err as Error).message}`,
        );
      }
    }

    try {
      return await this.searchWithDuckDuckGo(query, maxResults);
    } catch (err) {
      this.logger.error(`All search methods failed: ${(err as Error).message}`);
      return {
        query,
        results: [],
        summary: '',
        source: 'none',
      };
    }
  }

  /**
   * Tavily API — AI-optimized search, requires API key.
   * Free tier: 1000 searches/month.
   */
  private async searchWithTavily(
    query: string,
    maxResults: number,
  ): Promise<WebSearchResult> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.tavilyKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json() as any;

    const results: SearchResult[] = (data.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      snippet: r.content ?? '',
      url: r.url ?? '',
    }));

    return {
      query,
      results,
      summary: data.answer ?? '',
      source: 'tavily',
    };
  }

  /**
   * DuckDuckGo Instant Answer API — free, no key required.
   * Provides instant answers and related topics.
   */
  private async searchWithDuckDuckGo(
    query: string,
    maxResults: number,
  ): Promise<WebSearchResult> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&limit=${maxResults}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'EchoLife/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.status}`);
    }

    const data = await response.json() as any;

    const results: SearchResult[] = [];
    let summary = '';

    // Abstract (main answer)
    if (data.AbstractText) {
      summary = data.AbstractText;
      results.push({
        title: data.Heading ?? query,
        snippet: data.AbstractText,
        url: data.AbstractURL ?? '',
      });
    }

    // Answer (direct answer)
    if (data.Answer && !summary) {
      summary = data.Answer;
      results.push({
        title: query,
        snippet: data.Answer,
        url: '',
      });
    }

    // Related topics
    const relatedTopics = (data.RelatedTopics ?? []).slice(0, maxResults - results.length);
    for (const topic of relatedTopics) {
      if (topic.Text) {
        results.push({
          title: topic.Text.split(' - ')[0] ?? '',
          snippet: topic.Text,
          url: topic.FirstURL ?? '',
        });
      } else if (topic.Topics) {
        // Nested topics group
        for (const subTopic of topic.Topics.slice(0, 2)) {
          if (subTopic.Text) {
            results.push({
              title: subTopic.Text.split(' - ')[0] ?? '',
              snippet: subTopic.Text,
              url: subTopic.FirstURL ?? '',
            });
          }
        }
      }
      if (results.length >= maxResults) break;
    }

    return {
      query,
      results: results.slice(0, maxResults),
      summary,
      source: 'duckduckgo',
    };
  }

  /**
   * Formats search results for injection into LLM system prompt.
   */
  formatForPrompt(result: WebSearchResult): string {
    if (result.results.length === 0 && !result.summary) {
      return '';
    }

    const parts: string[] = [
      '【实时网络搜索结果】',
      `搜索关键词: ${result.query}`,
      `数据来源: ${result.source} (仅供参考)`,
      '',
    ];

    if (result.summary) {
      parts.push(`摘要: ${result.summary}`, '');
    }

    result.results.forEach((r, i) => {
      parts.push(`${i + 1}. ${r.title}`);
      if (r.snippet) {
        parts.push(`   ${r.snippet}`);
      }
      if (r.url) {
        parts.push(`   来源: ${r.url}`);
      }
      parts.push('');
    });

    parts.push('请基于以上搜索结果回答用户的问题。如果搜索结果不足以回答，请诚实告知并给出建议。');

    return parts.join('\n');
  }
}
