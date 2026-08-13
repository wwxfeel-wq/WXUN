import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';
import { QueryTrackingDto } from './dto/query-tracking.dto';

/**
 * TrackingService — 埋点追踪服务
 *
 * 负责接收前端上报的页面访问与交互事件，并提供管理员数据看板所需的
 * 聚合统计接口。所有写入操作采用 fire-and-forget 策略——即使数据库
 * 写入失败也不影响前端正常体验。
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Public: 事件上报
  // ============================================================

  /**
   * 记录一条埋点事件。
   *
   * IP 和 User-Agent 由控制器从 HTTP 请求中提取后传入，User-Agent 在
   * 此处进一步解析为 browser / os / deviceType。
   */
  async trackEvent(
    dto: TrackEventDto,
    ipAddress: string,
    userAgent: string | null,
    userId?: string,
  ): Promise<{ success: boolean; id?: string }> {
    const { browser, os, deviceType } = this.parseUserAgent(userAgent ?? '');

    try {
      const event = await this.prisma.trackingEvent.create({
        data: {
          sessionId: dto.sessionId,
          userId: userId ?? null,
          eventType: dto.eventType,
          pagePath: dto.pagePath,
          pageTitle: dto.pageTitle ?? null,
          referrer: dto.referrer ?? null,
          ipAddress,
          userAgent: userAgent ?? null,
          browser,
          os,
          deviceType,
          metadata: (dto.metadata ?? null) as Prisma.InputJsonValue,
        },
      });
      return { success: true, id: event.id };
    } catch (error) {
      // 埋点写入失败不应影响前端流程，仅记录日志
      this.logger.error(`Failed to track event: ${(error as Error).message}`);
      return { success: false };
    }
  }

  // ============================================================
  // Admin: 概览统计
  // ============================================================

  /**
   * 返回数据看板概览统计：
   * 总页面浏览量、独立访客数、独立 IP 数、24 小时事件数、
   * 热门页面 Top 10、事件类型分布、最近 20 条事件。
   */
  async getOverview() {
    const now = new Date();
    const last24h = new Date(now);
    last24h.setHours(last24h.getHours() - 24);

    const [
      totalPageViews,
      uniqueVisitorGroups,
      uniqueIpGroups,
      topPages,
      eventTypes,
      recentEvents,
      last24hCount,
    ] = await Promise.all([
      this.prisma.trackingEvent.count({
        where: { eventType: 'page_view' },
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['sessionId'],
        _count: true,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['ipAddress'],
        _count: true,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['pagePath'],
        _count: true,
        orderBy: { _count: { pagePath: 'desc' } },
        take: 10,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['eventType'],
        _count: true,
        orderBy: { _count: { eventType: 'desc' } },
      }),
      this.prisma.trackingEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          sessionId: true,
          eventType: true,
          pagePath: true,
          pageTitle: true,
          ipAddress: true,
          browser: true,
          os: true,
          deviceType: true,
          country: true,
          city: true,
          createdAt: true,
        },
      }),
      this.prisma.trackingEvent.count({
        where: { createdAt: { gte: last24h } },
      }),
    ]);

    return {
      totalPageViews,
      uniqueVisitors: uniqueVisitorGroups.length,
      uniqueIps: uniqueIpGroups.length,
      last24hCount,
      topPages: topPages.map((p) => ({
        pagePath: p.pagePath,
        count: p._count,
      })),
      eventTypes: eventTypes.map((e) => ({
        eventType: e.eventType,
        count: e._count,
      })),
      recentEvents,
    };
  }

  // ============================================================
  // Admin: 事件列表（分页 + 筛选）
  // ============================================================

  /**
   * 分页查询埋点事件，支持按事件类型、IP 地址、时间范围筛选。
   */
  async getEvents(query: QueryTrackingDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhereClause(query);

    const [items, total] = await Promise.all([
      this.prisma.trackingEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.trackingEvent.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ============================================================
  // Admin: IP 列表（聚合）
  // ============================================================

  /**
   * 返回聚合后的 IP 访问列表，包含访问次数、最后访问时间、地理位置。
   * 同一 IP 可能有多条 country/city 组合，在内存中合并取首个非空值。
   */
  async getIpList() {
    const ipGroups = await this.prisma.trackingEvent.groupBy({
      by: ['ipAddress', 'country', 'city'],
      _count: true,
      _max: { createdAt: true },
      orderBy: { _count: { ipAddress: 'desc' } },
      take: 200,
    });

    // 同一 IP 的多条 country/city 记录在内存中合并
    const ipMap = new Map<
      string,
      {
        ipAddress: string;
        visitCount: number;
        lastSeen: Date;
        country: string | null;
        city: string | null;
      }
    >();

    for (const g of ipGroups) {
      const existing = ipMap.get(g.ipAddress);
      if (existing) {
        existing.visitCount += g._count;
        const maxDate = g._max.createdAt;
        if (maxDate && maxDate > existing.lastSeen) {
          existing.lastSeen = maxDate;
        }
        if (!existing.country && g.country) existing.country = g.country;
        if (!existing.city && g.city) existing.city = g.city;
      } else {
        ipMap.set(g.ipAddress, {
          ipAddress: g.ipAddress,
          visitCount: g._count,
          lastSeen: g._max.createdAt ?? new Date(0),
          country: g.country,
          city: g.city,
        });
      }
    }

    return Array.from(ipMap.values()).sort(
      (a, b) => b.visitCount - a.visitCount,
    );
  }

  // ============================================================
  // Admin: 小时级统计（最近 24 小时，用于图表）
  // ============================================================

  /**
   * 返回最近 24 小时的小时级事件统计，每个桶包含事件数和独立访客数。
   * 用于管理后台趋势图表渲染。
   */
  async getHourly() {
    const now = new Date();
    const since = new Date(now);
    since.setHours(since.getHours() - 23);
    since.setMinutes(0, 0, 0);

    // 初始化 24 个小时桶
    const bucketMap = new Map<
      string,
      { count: number; sessions: Set<string> }
    >();
    const bucketKeys: string[] = [];

    for (let i = 0; i < 24; i++) {
      const d = new Date(since);
      d.setHours(d.getHours() + i);
      const key = d.toISOString();
      bucketKeys.push(key);
      bucketMap.set(key, { count: 0, sessions: new Set() });
    }

    // 拉取时间范围内的事件
    const events = await this.prisma.trackingEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, sessionId: true },
    });

    // 将事件分配到对应的桶
    for (const event of events) {
      const d = new Date(event.createdAt);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.sessions.add(event.sessionId);
      }
    }

    return bucketKeys.map((key) => {
      const bucket = bucketMap.get(key)!;
      return {
        hour: key,
        count: bucket.count,
        uniqueVisitors: bucket.sessions.size,
      };
    });
  }

  // ============================================================
  // Private: 辅助方法
  // ============================================================

  /**
   * 根据查询参数构建 Prisma where 条件。
   */
  private buildWhereClause(
    query: QueryTrackingDto,
  ): Prisma.TrackingEventWhereInput {
    const where: Prisma.TrackingEventWhereInput = {};

    if (query.eventType) {
      where.eventType = query.eventType;
    }

    if (query.ipAddress) {
      where.ipAddress = { contains: query.ipAddress };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    return where;
  }

  /**
   * 从 User-Agent 字符串中解析浏览器名称、操作系统和设备类型。
   * 使用简单的正则匹配，不依赖外部库。
   */
  private parseUserAgent(ua: string): {
    browser: string;
    os: string;
    deviceType: string;
  } {
    let browser = 'Unknown';
    let os = 'Unknown';
    let deviceType = 'desktop';

    if (/Mobile|Android|iPhone/.test(ua)) deviceType = 'mobile';
    else if (/iPad|Tablet/.test(ua)) deviceType = 'tablet';

    if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
    else if (/Firefox\/(\d+)/.test(ua)) browser = 'Firefox';
    else if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Edg\/(\d+)/.test(ua)) browser = 'Edge';

    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iOS|iPhone|iPad/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    return { browser, os, deviceType };
  }
}
