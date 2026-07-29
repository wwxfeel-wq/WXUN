import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Aggregate all dashboard data in parallel for the visualization page.
   * Wrapped in try/catch per section so a single failure doesn't break the whole board.
   */
  async getDashboard() {
    const [overview, aiStats, agentDistribution, memoryByType, userByRole, recentUsers, aiTrend, agentConfigs, systemConfigs, recentAuditLogs, announcements] =
      await Promise.all([
        this.getOverview().catch((e) => this.fallback('overview', e, {
          users: 0, memories: 0, interviews: 0, aiCalls: 0, capsules: 0,
          summaries: 0, lifeTreeNodes: 0, knowledgeEntities: 0, families: 0,
          personalityProfiles: 0, notifications: 0, auditLogs: 0,
        })),
        this.getAiStats().catch((e) => this.fallback('aiStats', e, this.emptyAiStats())),
        this.getAgentDistribution().catch((e) => this.fallback('agentDist', e, [])),
        this.getMemoryByType().catch((e) => this.fallback('memoryByType', e, [])),
        this.getUserByRole().catch((e) => this.fallback('userByRole', e, [])),
        this.getRecentUsers().catch((e) => this.fallback('recentUsers', e, [])),
        this.getAiTrend(7).catch((e) => this.fallback('aiTrend', e, [])),
        this.getAgentConfigs().catch((e) => this.fallback('agentConfigs', e, [])),
        this.getSystemConfigs().catch((e) => this.fallback('systemConfigs', e, [])),
        this.getRecentAuditLogs().catch((e) => this.fallback('recentAuditLogs', e, [])),
        this.getAnnouncements().catch((e) => this.fallback('announcements', e, [])),
      ]);

    // Redis info (non-critical)
    let redisInfo = { connected: false, uptime: 0, usedMemory: '', clients: 0 };
    try {
      redisInfo = await this.getRedisInfo();
    } catch (e) {
      this.logger.warn(`Redis info failed: ${(e as Error).message}`);
    }

    return {
      generatedAt: new Date().toISOString(),
      overview,
      aiStats,
      agentDistribution,
      memoryByType,
      userByRole,
      recentUsers,
      aiTrend,
      agentConfigs,
      systemConfigs,
      recentAuditLogs,
      announcements,
      redisInfo,
    };
  }

  private async getOverview() {
    const [
      users, memories, interviews, aiCalls, capsules, summaries,
      lifeTreeNodes, knowledgeEntities, families, personalityProfiles,
      notifications, auditLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.memory.count({ where: { isDeleted: false } }),
      this.prisma.interview.count(),
      this.prisma.aICallLog.count(),
      this.prisma.timeCapsule.count(),
      this.prisma.summary.count(),
      this.prisma.lifeTreeNode.count(),
      this.prisma.knowledgeEntity.count(),
      this.prisma.family.count(),
      this.prisma.personalityProfile.count(),
      this.prisma.notification.count(),
      this.prisma.auditLog.count(),
    ]);

    return {
      users, memories, interviews, aiCalls, capsules, summaries,
      lifeTreeNodes, knowledgeEntities, families, personalityProfiles,
      notifications, auditLogs,
    };
  }

  private emptyAiStats() {
    return { totalTokens: 0, promptTokens: 0, completionTokens: 0, avgLatencyMs: 0, successCount: 0, errorCount: 0, totalCalls: 0 };
  }

  private async getAiStats() {
    const agg = await this.prisma.aICallLog.aggregate({
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _avg: { latencyMs: true },
      _count: true,
    });
    const successCount = await this.prisma.aICallLog.count({ where: { status: 'success' } });
    const errorCount = await this.prisma.aICallLog.count({ where: { status: { not: 'success' } } });

    return {
      totalTokens: agg._sum.totalTokens ?? 0,
      promptTokens: agg._sum.promptTokens ?? 0,
      completionTokens: agg._sum.completionTokens ?? 0,
      avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
      successCount,
      errorCount,
      totalCalls: agg._count,
    };
  }

  private async getAgentDistribution() {
    const grouped = await this.prisma.aICallLog.groupBy({
      by: ['agentType'],
      _count: true,
      _sum: { totalTokens: true },
      orderBy: { _count: { agentType: 'desc' } },
    });
    return grouped.map((g) => ({
      agentType: g.agentType,
      count: g._count,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  private async getMemoryByType() {
    const grouped = await this.prisma.memory.groupBy({
      by: ['type'],
      _count: true,
      where: { isDeleted: false },
    });
    return grouped.map((g) => ({ type: g.type, count: g._count }));
  }

  private async getUserByRole() {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { userRoles: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({ role: r.name, count: r._count.userRoles }));
  }

  private async getRecentUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { nickname: true, avatarUrl: true } },
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.profile?.nickname ?? null,
      avatarUrl: u.profile?.avatarUrl ?? null,
      status: u.status,
      roles: u.userRoles.map((ur) => ur.role.name),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  private async getAiTrend(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const logs = await this.prisma.aICallLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, totalTokens: true, status: true },
    });

    // Bucket by day
    const buckets: Record<string, { calls: number; tokens: number; errors: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { calls: 0, tokens: 0, errors: 0 };
    }
    for (const log of logs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) {
        buckets[key].calls += 1;
        buckets[key].tokens += log.totalTokens;
        if (log.status !== 'success') buckets[key].errors += 1;
      }
    }
    return Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
  }

  private async getAgentConfigs() {
    return this.prisma.agentConfig.findMany({
      orderBy: { agentType: 'asc' },
      select: {
        agentType: true,
        model: true,
        temperature: true,
        maxTokens: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  private async getSystemConfigs() {
    return this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, value: true, type: true, description: true, updatedAt: true },
    });
  }

  private async getRecentAuditLogs() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        user: { select: { email: true, profile: { select: { nickname: true } } } },
        actionByUser: { select: { email: true, profile: { select: { nickname: true } } } },
      },
    });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      resource: l.resource,
      resourceId: l.resourceId,
      userEmail: l.user?.email ?? null,
      actionByEmail: l.actionByUser?.email ?? null,
      createdAt: l.createdAt,
    }));
  }

  private async getAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  private async getRedisInfo() {
    const client = this.redis.getClient;
    const pong = await client.ping();
    const info = (await client.info('memory')) as string;
    const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
    const connectedClientsMatch = info.match(/connected_clients:(.+)/);
    const uptimeMatch = (await client.info('server')).match(/uptime_in_seconds:(.+)/);
    return {
      connected: pong === 'PONG',
      uptime: uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0,
      usedMemory: usedMemoryMatch ? usedMemoryMatch[1].trim() : 'unknown',
      clients: connectedClientsMatch ? parseInt(connectedClientsMatch[1], 10) : 0,
    };
  }

  private fallback<T>(section: string, e: unknown, defaultValue: T): T {
    this.logger.error(`[${section}] failed: ${(e as Error).message}`);
    return defaultValue;
  }
}
