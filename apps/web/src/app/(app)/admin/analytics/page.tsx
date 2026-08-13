"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  Globe,
  Users,
  Eye,
  TrendingUp,
  Clock,
  Monitor,
  Smartphone,
  Tablet,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import useSWR from "swr";
import { PageTransition } from "@/components/page-transition";
import { GlassLayer } from "@/components/glass";
import { swrFetcher } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { FullScreenLoader } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
 * Analytics Dashboard — 埋点分析
 *
 * 展示网站追踪数据：总览、小时趋势、热门页面、设备分布、
 * IP 列表与最近事件。仅 super_admin / operator 可访问。
 * ═══════════════════════════════════════════════════════════ */

// ─── Types ──────────────────────────────────────────────────

interface TopPage {
  pagePath: string;
  count: number;
}

interface EventTypeDist {
  eventType: string;
  count: number;
}

interface RecentEvent {
  id: string;
  pagePath: string;
  ipAddress: string;
  browser: string;
  os: string;
  deviceType: string;
  country: string;
  city: string;
  createdAt: string;
}

interface TrackingOverview {
  totalPageViews: number;
  uniqueVisitors: number;
  uniqueIps: number;
  last24hEvents: number;
  topPages: TopPage[];
  eventTypeDistribution: EventTypeDist[];
  recentEvents: RecentEvent[];
}

interface HourlyData {
  hour: string;
  count: number;
  uniqueVisitors: number;
}

interface IpListItem {
  ipAddress: string;
  country: string;
  city: string;
  visitCount: number;
  lastSeen: string;
  browser: string;
  os: string;
  deviceType: string;
}

interface TrackingEvent {
  id: string;
  sessionId: string;
  eventType: string;
  pagePath: string;
  pageTitle: string;
  referrer: string;
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
  deviceType: string;
  country: string;
  city: string;
  metadata: unknown;
  createdAt: string;
}

interface EventsResponse {
  items: TrackingEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Helpers ────────────────────────────────────────────────

function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const d = new Date(date);
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return d.toLocaleDateString("zh-CN");
}

function getDeviceIcon(deviceType: string) {
  const t = deviceType.toLowerCase();
  if (t.includes("mobile") || t.includes("phone")) return Smartphone;
  if (t.includes("tablet")) return Tablet;
  return Monitor;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

// ─── Page Component ─────────────────────────────────────────

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const isAdmin =
    user?.roles?.some((r) => r === "super_admin" || r === "operator") ?? false;

  // 客户端角色守卫：非 admin 用户重定向到首页
  React.useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/");
    }
  }, [user, isAdmin, router]);

  // 角色未确定前显示加载状态
  if (!user || !isAdmin) {
    return <FullScreenLoader />;
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface/40 hover:text-text focus-ring"
            aria-label="返回管理"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-text">埋点分析</h1>
            <p className="text-xs text-text-muted">
              网站访问追踪与用户行为分析
            </p>
          </div>
        </div>

        {/* Overview Cards */}
        <OverviewCards />

        {/* Hourly Chart */}
        <HourlyChart />

        {/* Top Pages + Device Distribution */}
        <OverviewDetails />

        {/* IP List */}
        <IpListSection />

        {/* Recent Events */}
        <RecentEventsSection />
      </div>
    </PageTransition>
  );
}

/* ============================================================
 * Overview Cards — 总览卡片
 * ============================================================ */

function OverviewCards() {
  const { data, isLoading } = useSWR<TrackingOverview>(
    "/tracking/overview",
    swrFetcher,
    { refreshInterval: 30000 },
  );

  const cards = [
    {
      label: "总页面浏览",
      value: data?.totalPageViews,
      icon: Eye,
    },
    {
      label: "独立访客",
      value: data?.uniqueVisitors,
      icon: Users,
    },
    {
      label: "独立 IP",
      value: data?.uniqueIps,
      icon: Globe,
    },
    {
      label: "24h 事件数",
      value: data?.last24hEvents,
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <GlassLayer asChild intensity="default" key={card.label}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1],
                delay: idx * 0.06,
              }}
              className="p-5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <p className="text-xs text-text-muted">{card.label}</p>
              {isLoading ? (
                <div className="skeleton mt-1.5 h-7 w-20 rounded-lg" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-text">
                  {formatNumber(card.value ?? 0)}
                </p>
              )}
            </motion.div>
          </GlassLayer>
        );
      })}
    </div>
  );
}

/* ============================================================
 * Hourly Chart — 小时趋势柱状图
 * ============================================================ */

function HourlyChart() {
  const { data, isLoading } = useSWR<HourlyData[]>(
    "/tracking/hourly",
    swrFetcher,
    { refreshInterval: 30000 },
  );

  const hourlyData = data ?? [];
  const maxCount = Math.max(1, ...hourlyData.map((d) => d.count));

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Clock className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">
              24 小时访问趋势
            </h2>
            <p className="text-xs text-text-muted">每小时页面浏览量与独立访客</p>
          </div>
        </div>

        {isLoading ? (
          <div className="skeleton h-40 w-full rounded-xl" />
        ) : hourlyData.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            暂无数据
          </div>
        ) : (
          <div className="flex h-40 items-end gap-1">
            {hourlyData.map((d, i) => {
              const heightPct = (d.count / maxCount) * 100;
              const date = new Date(d.hour);
              const hourLabel = `${date.getHours()}时`;
              const showLabel = i % 4 === 0 || i === hourlyData.length - 1;
              return (
                <div
                  key={d.hour}
                  className="group relative flex flex-1 flex-col items-center gap-1"
                >
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-12 z-10 hidden whitespace-nowrap rounded-lg bg-surface-raised px-2 py-1 text-3xs text-text shadow-glass-soft group-hover:block">
                    {hourLabel} · {d.count} 次
                  </div>
                  {/* Bar */}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-accent/80 transition-all duration-300 hover:bg-accent"
                      style={{
                        height: `${Math.max(heightPct, 2)}%`,
                        minHeight: "3px",
                      }}
                    />
                  </div>
                  {/* Label */}
                  <span
                    className={cn(
                      "text-3xs text-text-muted",
                      !showLabel && "opacity-0",
                    )}
                  >
                    {showLabel ? hourLabel : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </GlassLayer>
  );
}

/* ============================================================
 * Overview Details — Top Pages + Device/Browser Distribution
 * ============================================================ */

function OverviewDetails() {
  const { data, isLoading } = useSWR<TrackingOverview>(
    "/tracking/overview",
    swrFetcher,
    { refreshInterval: 30000 },
  );

  const topPages = data?.topPages ?? [];
  const recentEvents = data?.recentEvents ?? [];

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <TopPagesSection topPages={topPages} isLoading={isLoading} />
      <DeviceDistributionSection recentEvents={recentEvents} isLoading={isLoading} />
    </div>
  );
}

function TopPagesSection({
  topPages,
  isLoading,
}: {
  topPages: TopPage[];
  isLoading: boolean;
}) {
  const sorted = [...topPages].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...sorted.map((p) => p.count));

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <TrendingUp className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">热门页面</h2>
            <p className="text-xs text-text-muted">访问量最高的页面</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            暂无数据
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.slice(0, 10).map((page, idx) => (
              <div
                key={page.pagePath}
                className="flex items-center gap-3 rounded-lg bg-surface/40 px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-raised text-3xs font-medium text-text-muted">
                  {idx + 1}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="truncate text-sm text-text"
                    title={page.pagePath}
                  >
                    {page.pagePath}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${(page.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-medium text-text">
                    {formatNumber(page.count)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </GlassLayer>
  );
}

function DeviceDistributionSection({
  recentEvents,
  isLoading,
}: {
  recentEvents: RecentEvent[];
  isLoading: boolean;
}) {
  const { browserDist, deviceDist } = React.useMemo(() => {
    const browsers: Record<string, number> = {};
    const devices: Record<string, number> = {};

    for (const e of recentEvents) {
      const browser = e.browser || "Unknown";
      const device = e.deviceType || "Unknown";
      browsers[browser] = (browsers[browser] ?? 0) + 1;
      devices[device] = (devices[device] ?? 0) + 1;
    }

    return {
      browserDist: Object.entries(browsers).sort((a, b) => b[1] - a[1]),
      deviceDist: Object.entries(devices).sort((a, b) => b[1] - a[1]),
    };
  }, [recentEvents]);

  const total = recentEvents.length || 1;

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Monitor className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">设备与浏览器</h2>
            <p className="text-xs text-text-muted">基于最近访问事件统计</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-20 rounded-lg" />
            <div className="skeleton h-20 rounded-lg" />
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            暂无数据
          </div>
        ) : (
          <div className="space-y-5">
            {/* Device Type Distribution */}
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                设备类型
              </p>
              <div className="space-y-2">
                {deviceDist.map(([device, count]) => {
                  const Icon = getDeviceIcon(device);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div
                      key={device}
                      className="flex items-center gap-3"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="w-20 shrink-0 text-sm text-text">
                        {device}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs text-text-muted">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browser Distribution */}
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                浏览器
              </p>
              <div className="space-y-2">
                {browserDist.map(([browser, count]) => {
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={browser} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-sm text-text">
                        {browser}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className="h-full rounded-full bg-info/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs text-text-muted">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </GlassLayer>
  );
}

/* ============================================================
 * IP List Section — IP 访问列表
 * ============================================================ */

function IpListSection() {
  const { data, isLoading } = useSWR<IpListItem[]>(
    "/tracking/ip-list",
    swrFetcher,
    { refreshInterval: 30000 },
  );

  const ipList = data ?? [];

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Globe className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">IP 访问列表</h2>
            <p className="text-xs text-text-muted">访客 IP 地址与地理信息</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : ipList.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            暂无数据
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-medium">IP 地址</th>
                  <th className="pb-2 pr-4 font-medium">地区</th>
                  <th className="pb-2 pr-4 font-medium">访问次数</th>
                  <th className="pb-2 pr-4 font-medium">最近访问</th>
                  <th className="pb-2 pr-4 font-medium">浏览器</th>
                  <th className="pb-2 font-medium">设备</th>
                </tr>
              </thead>
              <tbody>
                {ipList.map((ip) => {
                  const DeviceIcon = getDeviceIcon(ip.deviceType);
                  return (
                    <tr
                      key={ip.ipAddress}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-sm text-text">
                          {ip.ipAddress}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-text-muted">
                        {ip.city || ip.country
                          ? `${ip.country ?? ""}${ip.country && ip.city ? " " : ""}${ip.city ?? ""}`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          {formatNumber(ip.visitCount)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-text-muted">
                        {formatRelativeTime(ip.lastSeen)}
                      </td>
                      <td className="py-2.5 pr-4 text-text-muted">
                        {ip.browser || "—"}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-1.5 text-text-muted">
                          <DeviceIcon className="h-3.5 w-3.5" />
                          <span className="text-xs">
                            {ip.deviceType || "—"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </GlassLayer>
  );
}

/* ============================================================
 * Recent Events Section — 最近事件（分页）
 * ============================================================ */

function RecentEventsSection() {
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const { data, isLoading } = useSWR<EventsResponse>(
    `/tracking/events?page=${page}&pageSize=${pageSize}`,
    swrFetcher,
    { refreshInterval: 30000, keepPreviousData: true },
  );

  const events = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <GlassLayer asChild intensity="strong">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Activity className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">最近事件</h2>
            <p className="text-xs text-text-muted">
              {data ? `共 ${formatNumber(data.total)} 条记录` : "加载中..."}
            </p>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            暂无数据
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="pb-2 pr-4 font-medium">时间</th>
                    <th className="pb-2 pr-4 font-medium">页面路径</th>
                    <th className="pb-2 pr-4 font-medium">事件类型</th>
                    <th className="pb-2 pr-4 font-medium">IP 地址</th>
                    <th className="pb-2 pr-4 font-medium">浏览器</th>
                    <th className="pb-2 font-medium">设备</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const DeviceIcon = getDeviceIcon(event.deviceType);
                    return (
                      <tr
                        key={event.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2.5 pr-4 text-xs text-text-muted">
                          {formatRelativeTime(event.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="block max-w-[200px] truncate text-text"
                            title={event.pagePath}
                          >
                            {event.pagePath}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="rounded-full bg-surface/40 px-2 py-0.5 text-xs text-text-muted">
                            {event.eventType}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="font-mono text-xs text-text-muted">
                            {event.ipAddress}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-text-muted">
                          {event.browser || "—"}
                        </td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-1.5 text-text-muted">
                            <DeviceIcon className="h-3.5 w-3.5" />
                            <span className="text-xs">
                              {event.deviceType || "—"}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface/40 hover:text-text disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <span className="text-xs text-text-muted">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface/40 hover:text-text disabled:opacity-[var(--state-disabled-opacity)] focus-ring"
                >
                  下一页
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </GlassLayer>
  );
}
