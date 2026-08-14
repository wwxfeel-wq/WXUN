import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as geoip from 'geoip-lite';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';
import { QueryTrackingDto } from './dto/query-tracking.dto';

/**
 * ISO 3166-1 alpha-2 国家代码 → 中文名称映射。
 * 用于将 geoip-lite 返回的国家代码转换为中文显示。
 */
const COUNTRY_ZH: Record<string, string> = {
  CN: '中国',
  HK: '中国香港',
  MO: '中国澳门',
  TW: '中国台湾',
  US: '美国',
  CA: '加拿大',
  JP: '日本',
  KR: '韩国',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  RU: '俄罗斯',
  IN: '印度',
  SG: '新加坡',
  AU: '澳大利亚',
  NZ: '新西兰',
  BR: '巴西',
  IT: '意大利',
  ES: '西班牙',
  NL: '荷兰',
  SE: '瑞典',
  CH: '瑞士',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  PH: '菲律宾',
  ID: '印度尼西亚',
  IE: '爱尔兰',
  AT: '奥地利',
  BE: '比利时',
  PT: '葡萄牙',
  PL: '波兰',
  UA: '乌克兰',
  TR: '土耳其',
  SA: '沙特阿拉伯',
  AE: '阿联酋',
  IL: '以色列',
  MX: '墨西哥',
  AR: '阿根廷',
  CL: '智利',
  ZA: '南非',
  EG: '埃及',
  NG: '尼日利亚',
  FI: '芬兰',
  NO: '挪威',
  DK: '丹麦',
  CZ: '捷克',
  GR: '希腊',
  HU: '匈牙利',
  RO: '罗马尼亚',
  BG: '保加利亚',
  KZ: '哈萨克斯坦',
  PK: '巴基斯坦',
  BD: '孟加拉国',
  LK: '斯里兰卡',
  NP: '尼泊尔',
  MM: '缅甸',
  KH: '柬埔寨',
  LA: '老挝',
  MN: '蒙古',
  KP: '朝鲜',
  IR: '伊朗',
  IQ: '伊拉克',
  CO: '哥伦比亚',
  PE: '秘鲁',
  VE: '委内瑞拉',
  CU: '古巴',
  MA: '摩洛哥',
  DZ: '阿尔及利亚',
  ET: '埃塞俄比亚',
  KE: '肯尼亚',
  GH: '加纳',
};

/** 常见中国城市英文名 → 中文名映射（geoip-lite 对中国城市返回英文）。 */
const CITY_ZH: Record<string, string> = {
  Beijing: '北京',
  Shanghai: '上海',
  Guangzhou: '广州',
  Shenzhen: '深圳',
  Hangzhou: '杭州',
  Chengdu: '成都',
  Chongqing: '重庆',
  Wuhan: '武汉',
  Xian: '西安',
  Nanjing: '南京',
  Suzhou: '苏州',
  Tianjin: '天津',
  Changsha: '长沙',
  Zhengzhou: '郑州',
  Qingdao: '青岛',
  Xiamen: '厦门',
  Fuzhou: '福州',
  Quanzhou: '泉州',
  Jinan: '济南',
  Shenyang: '沈阳',
  Harbin: '哈尔滨',
  Kunming: '昆明',
  Guiyang: '贵阳',
  Nanning: '南宁',
  Hefei: '合肥',
  Nanchang: '南昌',
  Changchun: '长春',
  Shijiazhuang: '石家庄',
  Taiyuan: '太原',
  Dalian: '大连',
  Ningbo: '宁波',
  Wuxi: '无锡',
  Foshan: '佛山',
  Dongguan: '东莞',
  Zhuhai: '珠海',
  Wenzhou: '温州',
  Shaoxing: '绍兴',
  Jiaxing: '嘉兴',
  Jinhua: '金华',
  Taizhou: '台州',
  Yiwu: '义乌',
};

/**
 * 埋点看板需要排除的内部页面路径前缀。
 * 这些是管理员自己的操作（登录/看板/部署冒烟测试），不属于真实用户行为，
 * 若计入会污染统计与趋势图。
 */
const EXCLUDED_PATH_PREFIXES = [
  '/admin',        // 管理后台（含 /admin/analytics 埋点看板）
  '/login',        // 登录页
  '/register',     // 注册页
  '/deploy-smoke', // 部署冒烟测试
  '/ssh-smoke',    // SSH 冒烟测试
];

/** 构建排除内部路径的 where 条件（供所有统计查询复用）。 */
function excludeInternalPaths(): Prisma.TrackingEventWhereInput {
  return {
    AND: EXCLUDED_PATH_PREFIXES.map((prefix) => ({
      NOT: { pagePath: { startsWith: prefix } },
    })),
  };
}

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
    const { country, city } = this.lookupGeo(ipAddress);

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
          country,
          city,
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
        where: { eventType: 'page_view', ...excludeInternalPaths() },
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['sessionId'],
        where: excludeInternalPaths(),
        _count: true,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['ipAddress'],
        where: excludeInternalPaths(),
        _count: true,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['pagePath'],
        where: excludeInternalPaths(),
        _count: true,
        orderBy: { _count: { pagePath: 'desc' } },
        take: 10,
      }),
      this.prisma.trackingEvent.groupBy({
        by: ['eventType'],
        where: excludeInternalPaths(),
        _count: true,
        orderBy: { _count: { eventType: 'desc' } },
      }),
      this.prisma.trackingEvent.findMany({
        where: excludeInternalPaths(),
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
        where: { createdAt: { gte: last24h }, ...excludeInternalPaths() },
      }),
    ]);

    return {
      totalPageViews,
      uniqueVisitors: uniqueVisitorGroups.length,
      uniqueIps: uniqueIpGroups.length,
      last24hEvents: last24hCount,
      topPages: topPages.map((p) => ({
        pagePath: p.pagePath,
        count: p._count,
      })),
      eventTypeDistribution: eventTypes.map((e) => ({
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
      where: excludeInternalPaths(),
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
        browser: string | null;
        os: string | null;
        deviceType: string | null;
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
          browser: null,
          os: null,
          deviceType: null,
        });
      }
    }

    // 为每个 IP 补齐最近一次事件的 browser/os/deviceType（单次查询，避免 N+1）
    const ips = Array.from(ipMap.keys());
    if (ips.length > 0) {
      const latestEvents = await this.prisma.trackingEvent.findMany({
        where: { ipAddress: { in: ips }, ...excludeInternalPaths() },
        orderBy: { createdAt: 'desc' },
        select: {
          ipAddress: true,
          browser: true,
          os: true,
          deviceType: true,
        },
      });
      const seen = new Set<string>();
      for (const e of latestEvents) {
        if (seen.has(e.ipAddress)) continue;
        seen.add(e.ipAddress);
        const item = ipMap.get(e.ipAddress);
        if (item) {
          item.browser = e.browser;
          item.os = e.os;
          item.deviceType = e.deviceType;
        }
      }
    }

    // 对 country/city 为空或仍为英文 ISO 代码的历史 IP 做懒回填
    // （解析后即时返回，并异步写回数据库，保证中英文显示一致性）
    for (const item of ipMap.values()) {
      const isMissing = !item.country && !item.city;
      const isEnglishCode =
        item.country != null && /^[A-Z]{2}$/.test(item.country);
      if (isMissing || isEnglishCode) {
        const geo = this.lookupGeo(item.ipAddress);
        if (geo.country || geo.city) {
          item.country = geo.country;
          item.city = geo.city;
          // fire-and-forget 回填数据库，不阻塞响应
          this.prisma.trackingEvent
            .updateMany({
              where: {
                ipAddress: item.ipAddress,
                OR: [
                  { country: null, city: null },
                  { country: { in: Object.keys(COUNTRY_ZH) } },
                ],
              },
              data: { country: geo.country, city: geo.city },
            })
            .catch(() => {
              /* 回填失败忽略 */
            });
        }
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
      where: { createdAt: { gte: since }, ...excludeInternalPaths() },
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

    // 始终排除内部路径（登录/管理后台/冒烟测试），与概览/图表保持一致
    return {
      AND: [where, excludeInternalPaths()],
    };
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

  /**
   * 根据 IP 地址解析地理位置（国家/城市）。
   * 使用 geoip-lite 内置的 MaxMind GeoLite2 离线数据库，无需外部 API。
   * 内网 IP 或无法解析的 IP 返回 null。
   */
  private lookupGeo(ip: string): {
    country: string | null;
    city: string | null;
  } {
    if (!ip || this.isPrivateIp(ip)) {
      return { country: null, city: null };
    }
    try {
      const geo = geoip.lookup(ip);
      if (!geo) {
        return { country: null, city: null };
      }
      return {
        country: geo.country
          ? (COUNTRY_ZH[geo.country] ?? geo.country)
          : null,
        city: geo.city ? (CITY_ZH[geo.city] ?? geo.city) : null,
      };
    } catch {
      // geoip 查询失败不应影响埋点写入
      return { country: null, city: null };
    }
  }

  /** 判断是否为内网/回环地址（这些 IP 无需也无法做地理定位）。 */
  private isPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
      ip.startsWith('::ffff:10.') ||
      ip.startsWith('::ffff:192.168.') ||
      ip.startsWith('::ffff:172.')
    );
  }
}
