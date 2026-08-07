'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Lightbulb,
  Wind,
  Bot,
  Sparkles,
  Activity,
  ToggleRight,
  AirVent,
  Columns3,
  Wifi,
  WifiOff,
  Power,
  Cpu,
  House,
  Unplug,
  Loader2,
  ShieldCheck,
  Sunrise,
  Moon,
  Search,
  Navigation,
  MapPin,
  Play,
  Square,
  Route,
  Battery,
  Clock,
  Refrigerator,
  Lock,
  Siren,
  Pill,
  Camera,
  Bell,
  AlertCircle,
  Heart,
  Shield,
  ShoppingBag,
  BookOpen,
  Check,
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FullScreenLoader } from '@/components/ui/loading';
import { apiClient, swrFetcher, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// 类型定义（镜像后端 iot.types.ts）
// ============================================================

type DeviceType =
  | 'light'
  | 'ac'
  | 'robot'
  | 'vacuum'
  | 'sensor'
  | 'switch'
  | 'curtain'
  | 'air_purifier'
  | 'fridge'
  | 'lock'
  | 'alarm'
  | 'medical'
  | 'camera';

type DeviceStatus = 'on' | 'off' | 'running' | 'idle' | 'charging';

type IoTPlatform = 'mihome' | 'homekit' | 'mock';

interface IoTDevice {
  id: string;
  platform: IoTPlatform;
  name: string;
  room: string;
  type: DeviceType;
  status: DeviceStatus;
  properties: Record<string, unknown>;
  online: boolean;
}

interface PlatformBinding {
  platform: IoTPlatform;
  bound: boolean;
  expiresAt?: string;
  updatedAt: string;
}

interface DevicesResponse {
  devices: IoTDevice[];
  count: number;
}

interface BindingsResponse {
  bindings: PlatformBinding[];
}

// ============================================================
// 设备类型图标映射
// ============================================================

const DEVICE_ICON_MAP: Record<DeviceType, React.ComponentType<{ size?: number; className?: string }>> = {
  light: Lightbulb,
  ac: AirVent,
  robot: Bot,
  vacuum: Sparkles,
  sensor: Activity,
  switch: ToggleRight,
  curtain: Columns3,
  air_purifier: Wind,
  fridge: Refrigerator,
  lock: Lock,
  alarm: Siren,
  medical: Pill,
  camera: Camera,
};

const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  light: '灯光',
  ac: '空调',
  robot: '机器人',
  vacuum: '扫地机',
  sensor: '传感器',
  switch: '开关',
  curtain: '窗帘',
  air_purifier: '空气净化器',
  fridge: '冰箱',
  lock: '门锁',
  alarm: '报警器',
  medical: '药盒',
  camera: '摄像头',
};

const PLATFORM_LABEL: Record<IoTPlatform, string> = {
  mihome: '米家',
  homekit: 'HomeKit',
  mock: '演示设备',
};

// ============================================================
// 动画常量
// ============================================================

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const springHover = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 25,
};

// ============================================================
// 主页面
// ============================================================

export default function DevicesPage() {
  const { data: devicesData, isLoading: devicesLoading, mutate: mutateDevices } = useSWR<DevicesResponse>(
    '/iot/devices',
    swrFetcher,
  );
  const { data: bindingsData, mutate: mutateBindings } = useSWR<BindingsResponse>(
    '/iot/bindings',
    swrFetcher,
  );

  const devices = devicesData?.devices ?? [];
  const bindings = bindingsData?.bindings ?? [];

  // 按房间分组
  const grouped = React.useMemo(() => {
    const map = new Map<string, IoTDevice[]>();
    for (const d of devices) {
      const room = d.room || '未分类';
      if (!map.has(room)) map.set(room, []);
      map.get(room)!.push(d);
    }
    return Array.from(map.entries());
  }, [devices]);

  // 绑定弹窗状态
  const [bindModal, setBindModal] = React.useState<IoTPlatform | null>(null);
  const [, setSceneLoading] = React.useState<string | null>(null);

  const triggerScene = async (scene: string) => {
    setSceneLoading(scene);
    try {
      await apiClient.post(`/iot/scene/${scene}`);
      await mutateDevices();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '场景触发失败');
    } finally {
      setSceneLoading(null);
    }
  };

  if (devicesLoading) {
    return <FullScreenLoader label="加载设备列表中..." />;
  }

  return (
    <PageTransition>
      <div
        className="w-full min-h-screen px-4 sm:px-8 lg:px-16 py-8 sm:py-10"
        style={{
          paddingBottom:
            'calc(var(--home-mobile-dock-clearance) + var(--safe-bottom) + var(--space-2xl))',
        }}
      >
        <div className="max-w-5xl mx-auto">
          {/* ===== Hero ===== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mb-8 sm:mb-10"
          >
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={16} className="text-accent" aria-hidden="true" />
              <span className="text-xs text-text-muted">智能设备管理</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-text tracking-tight mb-1">
              设备中心
            </h1>
            <p className="text-sm text-text-muted">
              {devices.length} 台设备 · {bindings.filter((b) => b.bound).length} 个平台已连接
            </p>
          </motion.div>

          {/* ===== 平台绑定区域 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={15} className="text-text-muted" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-text">平台绑定</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* 演示设备平台 — 始终在线 */}
              <PlatformCard
                platform="mock"
                bound={true}
                updatedAt={new Date().toISOString()}
                onBind={() => {}}
                onUnbind={async () => {}}
              />
              {(['mihome', 'homekit'] as IoTPlatform[]).map((platform) => {
                const binding = bindings.find((b) => b.platform === platform);
                const isBound = binding?.bound ?? false;
                return (
                  <PlatformCard
                    key={platform}
                    platform={platform}
                    bound={isBound}
                    updatedAt={binding?.updatedAt}
                    onBind={() => setBindModal(platform)}
                    onUnbind={async () => {
                      try {
                        await apiClient.delete(`/iot/bind/${platform}`);
                        await mutateBindings();
                      } catch (err) {
                        alert(err instanceof ApiError ? err.message : '解绑失败');
                      }
                    }}
                  />
                );
              })}
            </div>
          </motion.div>

          {/* ===== 时墨智能场景 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={15} className="text-accent" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-text">时墨智能场景</h2>
              <span className="text-xs text-text-subtle">一键触发设备自动化</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <SceneButton scene="morning" icon={Sunrise} label="晨间唤醒" desc="开窗帘·调灯光" onTrigger={triggerScene} />
              <SceneButton scene="noon" icon={Bot} label="午间清扫" desc="扫地机器人" onTrigger={triggerScene} />
              <SceneButton scene="evening" icon={House} label="归家模式" desc="开灯·开空调" onTrigger={triggerScene} />
              <SceneButton scene="sleep" icon={Moon} label="睡眠模式" desc="关灯·拉窗帘" onTrigger={triggerScene} />
              <SceneButton scene="patrol" icon={Search} label="环境巡检" desc="温湿度·空气" onTrigger={triggerScene} />
            </div>
          </motion.div>

          {/* ===== 时墨督促提醒 ===== */}
          <DeviceSupervisionSection />

          {/* ===== 扫地机器人路线规划 ===== */}
          <VacuumRouteSection />

          {/* ===== 设备列表 ===== */}
          {grouped.length === 0 ? (
            <GlassLayer
              asChild
              intensity="default"
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <House size={48} className="text-text-muted mx-auto mb-4" />
                <p className="text-base font-medium text-text">暂无设备</p>
                <p className="mt-2 text-sm text-text-muted">
                  绑定米家或 HomeKit 平台后，设备将自动同步到此处
                </p>
              </motion.div>
            </GlassLayer>
          ) : (
            <div className="space-y-8">
              {grouped.map(([room, roomDevices], roomIdx) => (
                <motion.div
                  key={room}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 + roomIdx * 0.08, ease: EASE }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <House size={14} className="text-text-muted" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-text">{room}</h3>
                    <span className="text-xs text-text-subtle">{roomDevices.length}</span>
                  </div>
                  <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {roomDevices.map((device) => (
                      <StaggerItem key={device.id}>
                        <DeviceCard
                          device={device}
                          onControl={async (action, property, value) => {
                            try {
                              await apiClient.post('/iot/devices/control', {
                                deviceId: device.id,
                                action,
                                property,
                                value,
                              });
                              await mutateDevices();
                            } catch (err) {
                              alert(err instanceof ApiError ? err.message : '操作失败');
                            }
                          }}
                        />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 绑定弹窗 */}
      {bindModal && (
        <BindPlatformModal
          platform={bindModal}
          onClose={() => setBindModal(null)}
          onSuccess={async () => {
            setBindModal(null);
            await mutateBindings();
            await mutateDevices();
          }}
        />
      )}
    </PageTransition>
  );
}

// ============================================================
// 平台绑定卡片
// ============================================================

function PlatformCard({
  platform,
  bound,
  updatedAt,
  onBind,
  onUnbind,
}: {
  platform: IoTPlatform;
  bound: boolean;
  updatedAt?: string;
  onBind: () => void;
  onUnbind: () => void;
}) {
  const [unbinding, setUnbinding] = React.useState(false);
  const label = PLATFORM_LABEL[platform];
  const isMock = platform === 'mock';

  const handleUnbind = async () => {
    if (!confirm(`确定解绑${label}平台吗？解绑后将无法控制该平台下的设备。`)) return;
    setUnbinding(true);
    try {
      await onUnbind();
    } finally {
      setUnbinding(false);
    }
  };

  return (
    <GlassLayer
      asChild
      intensity="strong"
      className="p-5 sm:p-6 relative overflow-hidden"
    >
      <motion.div whileHover={{ y: -3 }} transition={springHover}>
        {/* 环境辉光 */}
        <div
          className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-orb-md opacity-[0.10] pointer-events-none"
          style={{
            background: platform === 'mihome' ? 'var(--color-highlight)' : 'var(--color-secondary)',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: bound
                    ? 'color-mix(in srgb, var(--color-success), transparent 88%)'
                    : 'color-mix(in srgb, var(--color-gray-500), transparent 88%)',
                }}
              >
                {platform === 'mihome' ? (
                  <House size={18} className={bound ? 'text-success' : 'text-text-muted'} />
                ) : platform === 'mock' ? (
                  <Sparkles size={18} className="text-accent" />
                ) : (
                  <Cpu size={18} className={bound ? 'text-success' : 'text-text-muted'} />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-text">{label}</p>
                <p className="text-xs text-text-subtle">
                  {isMock
                    ? '内置演示 · 12 台设备'
                    : bound
                      ? `已绑定 · ${updatedAt ? new Date(updatedAt).toLocaleDateString() : ''}`
                      : '未绑定'}
                </p>
              </div>
            </div>
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full"
              style={{
                color: bound ? 'var(--color-success)' : 'var(--color-text-muted)',
                backgroundColor: bound
                  ? 'color-mix(in srgb, var(--color-success), transparent 85%)'
                  : 'var(--color-gray-900)',
                border: `1px solid ${
                  bound
                    ? 'color-mix(in srgb, var(--color-success), transparent 70%)'
                    : 'var(--color-glass-border)'
                }`,
              }}
            >
              {bound ? '已连接' : '未连接'}
            </span>
          </div>

          {isMock ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-accent py-1.5">
              <Sparkles size={12} />
              <span>开箱即用</span>
            </div>
          ) : bound ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnbind}
              loading={unbinding}
              className="gap-1.5 text-error hover:bg-error/10 w-full"
            >
              <Unplug className="h-3.5 w-3.5" />
              解绑
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onBind}
              className="gap-1.5 w-full"
            >
              {platform === 'mihome' ? '绑定小米账号' : '配置 Homebridge'}
            </Button>
          )}
        </div>
      </motion.div>
    </GlassLayer>
  );
}

// ============================================================
// 设备卡片
// ============================================================

function DeviceCard({
  device,
  onControl,
}: {
  device: IoTDevice;
  onControl: (action: 'turn_on' | 'turn_off' | 'set_property', property?: string, value?: unknown) => Promise<void>;
}) {
  const Icon = DEVICE_ICON_MAP[device.type] ?? Activity;
  const isOn = device.status === 'on' || device.status === 'running';
  const [controlling, setControlling] = React.useState(false);

  // 亮度属性（灯光类设备）
  const brightness = typeof device.properties?.brightness === 'number'
    ? (device.properties.brightness as number)
    : null;

  const handleToggle = async () => {
    setControlling(true);
    try {
      await onControl(isOn ? 'turn_off' : 'turn_on');
    } finally {
      setControlling(false);
    }
  };

  const handleBrightness = async (value: number) => {
    setControlling(true);
    try {
      await onControl('set_property', 'brightness', value);
    } finally {
      setControlling(false);
    }
  };

  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-4 sm:p-5 relative overflow-hidden"
      style={{
        borderColor: device.online
          ? undefined
          : 'color-mix(in srgb, var(--color-gray-500), transparent 80%)',
      }}
    >
      <motion.div
        whileHover={{ y: -2, scale: 1.005 }}
        transition={springHover}
      >
        {/* 环境辉光 */}
        {device.online && isOn && (
          <div
            className="absolute -top-16 -right-16 h-32 w-32 rounded-full blur-orb-md opacity-[0.08] pointer-events-none"
            style={{ background: 'var(--color-highlight)' }}
          />
        )}

        <div className="relative z-10">
          {/* 顶部：图标 + 名称 + 在线状态 */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: isOn
                    ? 'color-mix(in srgb, var(--color-highlight), transparent 85%)'
                    : 'var(--color-gray-900)',
                }}
              >
                <Icon
                  size={18}
                  className={isOn ? 'text-highlight' : 'text-text-muted'}
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{device.name}</p>
                <p className="text-xs text-text-subtle">{DEVICE_TYPE_LABEL[device.type]}</p>
              </div>
            </div>
            <span
              className="flex shrink-0 items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{
                color: device.online ? 'var(--color-success)' : 'var(--color-text-muted)',
                backgroundColor: device.online
                  ? 'color-mix(in srgb, var(--color-success), transparent 88%)'
                  : 'var(--color-gray-900)',
              }}
            >
              {device.online ? (
                <Wifi size={10} />
              ) : (
                <WifiOff size={10} />
              )}
              {device.online ? '在线' : '离线'}
            </span>
          </div>

          {/* 中部：开关 / 滑块 */}
          {device.online ? (
            <div className="space-y-3">
              {/* 灯光亮度滑块 */}
              {device.type === 'light' && brightness !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-text-muted">亮度</span>
                    <span className="text-xs font-medium text-text">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={brightness}
                    disabled={controlling}
                    onChange={(e) => handleBrightness(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface accent-[var(--color-highlight)]"
                    aria-label="调节亮度"
                  />
                </div>
              )}

              {/* 开关按钮 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Power
                    size={12}
                    className={isOn ? 'text-success' : 'text-text-muted'}
                  />
                  <span className="text-xs text-text-muted">
                    {isOn ? '已开启' : '已关闭'}
                  </span>
                </div>
                <Switch
                  checked={isOn}
                  onCheckedChange={handleToggle}
                  disabled={controlling}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 py-2 text-xs text-text-muted">
              <WifiOff size={12} />
              <span>设备离线，无法控制</span>
            </div>
          )}

          {/* 控制中指示 */}
          {controlling && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-accent">
              <Loader2 size={10} className="animate-spin" />
              <span>指令发送中...</span>
            </div>
          )}
        </div>
      </motion.div>
    </GlassLayer>
  );
}

// ============================================================
// 绑定平台弹窗
// ============================================================

function BindPlatformModal({
  platform,
  onClose,
  onSuccess,
}: {
  platform: IoTPlatform;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isMihome = platform === 'mihome';

  const [accessToken, setAccessToken] = React.useState('');
  const [refreshToken, setRefreshToken] = React.useState('');
  const [homebridgeUrl, setHomebridgeUrl] = React.useState('');
  const [authToken, setAuthToken] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAccessToken('');
    setRefreshToken('');
    setHomebridgeUrl('');
    setAuthToken('');
    setError(null);
  }, [platform]);

  const handleSubmit = async () => {
    if (isMihome) {
      if (!accessToken.trim()) {
        setError('请输入 Access Token');
        return;
      }
    } else {
      if (!homebridgeUrl.trim()) {
        setError('请输入 Homebridge URL');
        return;
      }
      if (!authToken.trim()) {
        setError('请输入 Auth Token');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/iot/bind/${platform}`, isMihome
        ? { accessToken: accessToken.trim(), refreshToken: refreshToken.trim() || undefined }
        : { homebridgeUrl: homebridgeUrl.trim(), authToken: authToken.trim() },
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '绑定失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isMihome ? '绑定小米账号' : '配置 Homebridge'}
      description={isMihome
        ? '输入米家开放平台的 Access Token 以同步设备'
        : '输入 Homebridge REST API 地址和鉴权 Token'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            确认绑定
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isMihome ? (
          <>
            <Input
              label="Access Token"
              placeholder="输入米家 Access Token..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              error={error ?? undefined}
            />
            <Input
              label="Refresh Token（可选）"
              placeholder="输入米家 Refresh Token..."
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              hint="用于 Token 过期后自动刷新"
            />
          </>
        ) : (
          <>
            <Input
              label="Homebridge URL"
              placeholder="http://192.168.1.10:51828"
              value={homebridgeUrl}
              onChange={(e) => setHomebridgeUrl(e.target.value)}
              error={error ?? undefined}
            />
            <Input
              label="Auth Token"
              placeholder="输入 Homebridge 鉴权 Token..."
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
            />
          </>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}

// ============================================================
// 场景触发按钮
// ============================================================

function SceneButton({
  scene,
  icon: Icon,
  label,
  desc,
  onTrigger,
}: {
  scene: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  desc: string;
  onTrigger: (scene: string) => Promise<void>;
}) {
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onTrigger(scene);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassLayer
      asChild
      intensity="default"
      className="p-4 relative overflow-hidden cursor-pointer"
    >
      <motion.button
        whileHover={{ y: -3, scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={springHover}
        onClick={handleClick}
        disabled={loading}
        className="w-full text-left"
      >
        <div
          className="absolute -top-12 -right-12 h-24 w-24 rounded-full blur-orb-md opacity-[0.08] pointer-events-none"
          style={{ background: 'var(--color-accent, var(--color-primary))' }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary), transparent 85%)',
              }}
            >
              {loading ? (
                <Loader2 size={14} className="text-accent animate-spin" />
              ) : (
                <Icon size={14} className="text-accent" />
              )}
            </span>
          </div>
          <p className="text-xs font-semibold text-text mb-0.5">{label}</p>
          <p className="text-[10px] text-text-subtle">{desc}</p>
        </div>
      </motion.button>
    </GlassLayer>
  );
}

// ============================================================
// 扫地机器人路线规划可视化
// ============================================================

interface VacuumWaypoint {
  room: string;
  step: number;
  x: number;
  y: number;
  action: 'enter' | 'clean' | 'turn' | 'avoid' | 'dock';
  durationSec: number;
  area: number;
  completed: boolean;
}

interface VacuumRoutePlan {
  name: string;
  mode: 'quick' | 'deep' | 'spot';
  totalArea: number;
  estimatedDurationSec: number;
  waypoints: VacuumWaypoint[];
  plannedAt: string;
}

interface VacuumCleaningEvent {
  type: 'obstacle' | 'dirt_detect' | 'low_battery' | 'room_complete' | 'stuck' | 'dock';
  timestamp: string;
  room: string;
  description: string;
  step: number;
}

interface VacuumState {
  isCleaning: boolean;
  mode: 'quick' | 'deep' | 'spot';
  route: VacuumRoutePlan | null;
  currentStep: number;
  cleanedArea: number;
  elapsedSec: number;
  battery: number;
  currentRoom: string;
  events: VacuumCleaningEvent[];
  startedAt: string | null;
  finishedAt: string | null;
}

const ROOM_COLORS: Record<string, string> = {
  客厅: 'rgba(99, 179, 237, 0.15)',
  主卧: 'rgba(167, 139, 250, 0.15)',
  书房: 'rgba(52, 211, 153, 0.15)',
  厨房: 'rgba(251, 146, 60, 0.15)',
  走廊: 'rgba(156, 163, 175, 0.1)',
  阳台: 'rgba(244, 114, 182, 0.15)',
};

function VacuumRouteSection() {
  const { data: vacuumState, mutate } = useSWR<VacuumState>(
    '/iot/vacuum/status',
    swrFetcher,
    { refreshInterval: 2000 },
  );
  const [starting, setStarting] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);

  const isCleaning = vacuumState?.isCleaning ?? false;
  const route = vacuumState?.route;
  const progress = route && route.waypoints.length > 0
    ? Math.round(((vacuumState?.currentStep ?? 0) / route.waypoints.length) * 100)
    : 0;

  const handleStart = async (mode: 'quick' | 'deep' | 'spot') => {
    setStarting(true);
    try {
      await apiClient.post('/iot/vacuum/start', { mode });
      await mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '启动失败');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await apiClient.post('/iot/vacuum/stop');
      await mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '停止失败');
    } finally {
      setStopping(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
      className="mb-8"
    >
      <div className="flex items-center justify-center gap-2 mb-4">
        <Route size={15} className="text-accent" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text">扫地机器人路线规划</h2>
        <span className="text-xs text-text-subtle">
          {isCleaning ? '清扫中' : '待命'}
        </span>
        {isCleaning && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            实时
          </span>
        )}
      </div>

      <GlassLayer asChild intensity="strong" className="p-5 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：SVG 路线地图 */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-between mb-3 w-full">
              <p className="text-xs font-medium text-text-muted">清扫路线图</p>
              {route && (
                <span className="text-xs text-text-subtle">{route.name}</span>
              )}
            </div>
            <div className="relative rounded-xl overflow-hidden w-full max-w-md mx-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <svg viewBox="0 0 100 90" className="w-full" style={{ aspectRatio: '10/9' }}>
                {/* 房间矩形 */}
                {Object.entries({
                  客厅: { x: 10, y: 10, w: 40, h: 35 },
                  主卧: { x: 55, y: 10, w: 35, h: 30 },
                  书房: { x: 55, y: 45, w: 35, h: 20 },
                  厨房: { x: 10, y: 50, w: 25, h: 20 },
                  走廊: { x: 38, y: 50, w: 12, h: 15 },
                  阳台: { x: 38, y: 70, w: 30, h: 15 },
                }).map(([room, layout]) => (
                  <g key={room}>
                    <rect
                      x={layout.x}
                      y={layout.y}
                      width={layout.w}
                      height={layout.h}
                      fill={ROOM_COLORS[room] || 'rgba(100,100,100,0.1)'}
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="0.4"
                      rx="1.5"
                    />
                    <text
                      x={layout.x + layout.w / 2}
                      y={layout.y + layout.h / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255,255,255,0.35)"
                      fontSize="4"
                      fontWeight="500"
                    >
                      {room}
                    </text>
                  </g>
                ))}

                {/* 路线连线 */}
                {route && route.waypoints.length > 1 && (
                  <polyline
                    points={route.waypoints
                      .map((w) => `${w.x},${w.y}`)
                      .join(' ')}
                    fill="none"
                    stroke="rgba(99, 179, 237, 0.3)"
                    strokeWidth="0.6"
                    strokeDasharray="1.5,1"
                  />
                )}

                {/* 已完成路线 */}
                {route && route.waypoints.length > 1 && (
                  <polyline
                    points={route.waypoints
                      .slice(0, (vacuumState?.currentStep ?? 0) + 1)
                      .map((w) => `${w.x},${w.y}`)
                      .join(' ')}
                    fill="none"
                    stroke="rgb(99, 179, 237)"
                    strokeWidth="1"
                  />
                )}

                {/* 路线节点 */}
                {route?.waypoints.map((wp) => {
                  const isCurrent = wp.step === (vacuumState?.currentStep ?? 0);
                  const isCompleted = wp.completed;
                  return (
                    <g key={wp.step}>
                      <circle
                        cx={wp.x}
                        cy={wp.y}
                        r={isCurrent ? '2' : '1'}
                        fill={
                          isCurrent
                            ? 'rgb(99, 179, 237)'
                            : isCompleted
                              ? 'rgba(52, 211, 153, 0.8)'
                              : 'rgba(255,255,255,0.3)'
                        }
                        className={isCurrent ? 'animate-pulse' : ''}
                      />
                      {isCurrent && (
                        <circle
                          cx={wp.x}
                          cy={wp.y}
                          r="3.5"
                          fill="none"
                          stroke="rgb(99, 179, 237)"
                          strokeWidth="0.4"
                          opacity="0.5"
                        />
                      )}
                    </g>
                  );
                })}

                {/* 充电桩 */}
                <rect x="13" y="13" width="4" height="4" fill="rgba(251, 191, 36, 0.4)" rx="0.5" />
                <text x="15" y="20" textAnchor="middle" fill="rgba(251, 191, 36, 0.6)" fontSize="2.5">⚡</text>
              </svg>
            </div>

            {/* 进度条 */}
            {route && (
              <div className="mt-3 w-full max-w-md mx-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">清扫进度</span>
                  <span className="text-xs font-medium text-text">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'var(--color-accent, rgb(99, 179, 237))' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 右侧：状态面板 */}
          <div className="flex flex-col gap-4">
            {/* 状态指标 */}
            <div className="grid grid-cols-2 gap-3">
              <StatusMetric
                icon={MapPin}
                label="当前位置"
                value={vacuumState?.currentRoom ?? '充电桩'}
                color="var(--color-accent)"
              />
              <StatusMetric
                icon={Battery}
                label="剩余电量"
                value={`${vacuumState?.battery ?? 0}%`}
                color={(vacuumState?.battery ?? 100) < 20 ? 'var(--color-error)' : 'var(--color-success)'}
              />
              <StatusMetric
                icon={Navigation}
                label="已清扫"
                value={`${vacuumState?.cleanedArea ?? 0}㎡`}
                color="var(--color-accent)"
              />
              <StatusMetric
                icon={Clock}
                label="已耗时"
                value={
                  vacuumState?.elapsedSec
                    ? `${Math.floor(vacuumState.elapsedSec / 60)}'${(vacuumState.elapsedSec % 60).toString().padStart(2, '0')}"`
                    : "0'00"
                }
                color="var(--color-text-muted)"
              />
            </div>

            {/* 路线信息 */}
            {route && (
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs font-medium text-text mb-2">路线规划</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {route.waypoints
                    .filter((w) => w.action === 'enter')
                    .map((wp, i, arr) => (
                      <React.Fragment key={wp.step}>
                        <span className={`text-xs ${wp.completed ? 'text-success' : 'text-text-muted'}`}>
                          {wp.room}
                        </span>
                        {i < arr.length - 1 && (
                          <span className="text-text-subtle text-xs">→</span>
                        )}
                      </React.Fragment>
                    ))}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-text-subtle">
                  <span>面积 {route.totalArea}㎡</span>
                  <span>·</span>
                  <span>{route.waypoints.length} 节点</span>
                  <span>·</span>
                  <span>预计 {Math.floor(route.estimatedDurationSec / 60)} 分钟</span>
                </div>
              </div>
            )}

            {/* 事件日志 */}
            {vacuumState?.events && vacuumState.events.length > 0 && (
              <div className="rounded-lg p-3 max-h-48 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs font-medium text-text mb-2">事件日志</p>
                <div className="space-y-1.5">
                  {vacuumState.events.slice(-8).reverse().map((evt, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 mt-0.5">
                        {evt.type === 'obstacle' ? '⚠️' :
                         evt.type === 'dirt_detect' ? '🧹' :
                         evt.type === 'low_battery' ? '🔋' :
                         evt.type === 'dock' ? '⚡' : '✅'}
                      </span>
                      <span className="text-text-muted">{evt.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 控制按钮 */}
            <div className="flex flex-wrap items-center gap-2">
              {!isCleaning ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStart('quick')}
                    disabled={starting}
                    className="gap-1.5"
                  >
                    <Play size={12} />
                    快速清扫
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleStart('deep')}
                    disabled={starting}
                    loading={starting}
                    className="gap-1.5"
                  >
                    <Bot size={12} />
                    深度清扫
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStart('spot')}
                    disabled={starting}
                    className="gap-1.5"
                  >
                    <MapPin size={12} />
                    重点清扫
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleStop}
                  disabled={stopping}
                  loading={stopping}
                  className="gap-1.5"
                >
                  <Square size={12} />
                  停止清扫
                </Button>
              )}
            </div>
          </div>
        </div>
      </GlassLayer>
    </motion.div>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-text-muted" />
        <span className="text-[10px] text-text-subtle">{label}</span>
      </div>
      <p className="text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

// ============================================================
// 时墨督促提醒（设备页精简版）
// ============================================================

interface DeviceSupervision {
  id: string;
  familyMember: { name: string; role: string; avatar: string };
  type: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'resolved' | 'snoozed';
  sourceDevice?: string;
  suggestedAction: string;
}

const SUP_META: Record<string, { icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  medication_reminder: { icon: Pill, color: 'var(--color-error)', label: '用药' },
  homework_reminder: { icon: BookOpen, color: 'var(--color-info)', label: '学习' },
  grocery_reminder: { icon: ShoppingBag, color: 'var(--color-warning)', label: '食材' },
  safety_check: { icon: Shield, color: 'var(--color-error)', label: '安全' },
  health_check: { icon: Heart, color: 'var(--color-accent)', label: '健康' },
  schedule_reminder: { icon: Clock, color: 'var(--color-text-muted)', label: '日程' },
};

const SUP_PRIORITY: Record<string, string> = {
  high: 'border-error/30 bg-error/[0.06]',
  medium: 'border-warning/20 bg-warning/[0.04]',
  low: 'border-transparent bg-[rgba(255,255,255,0.03)]',
};

function DeviceSupervisionSection() {
  const { data, mutate } = useSWR<{ supervisions: DeviceSupervision[] }>(
    '/families/supervisions',
    swrFetcher,
    { refreshInterval: 15000 },
  );
  const [resolving, setResolving] = React.useState<string | null>(null);

  const supervisions = data?.supervisions ?? [];
  const activeList = supervisions.filter((s) => s.status === 'active');

  if (activeList.length === 0) return null;

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await apiClient.post(`/families/supervisions/${id}/resolve`);
      await mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    } finally {
      setResolving(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
      className="mb-8"
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell size={15} className="text-accent" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text">时墨督促提醒</h2>
        <Badge variant="accent">{activeList.length}</Badge>
        <span className="text-xs text-text-subtle">基于设备状态自动检测</span>
      </div>

      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activeList.map((sup) => {
          const meta = SUP_META[sup.type] ?? { icon: AlertCircle, color: 'var(--color-text-muted)', label: '提醒' };
          const Icon = meta.icon;
          return (
            <StaggerItem key={sup.id}>
              <GlassLayer
                asChild
                intensity="default"
                className={cn('p-4 border', SUP_PRIORITY[sup.priority])}
              >
                <motion.div whileHover={{ y: -2 }} transition={springHover}>
                  <div className="flex items-start gap-3 mb-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `color-mix(in srgb, ${meta.color}, transparent 88%)` }}
                    >
                      <Icon size={13} style={{ color: meta.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm">{sup.familyMember.avatar}</span>
                        <p className="text-xs font-medium text-text truncate">{sup.title}</p>
                      </div>
                      <p className="text-[11px] text-text-muted line-clamp-2">{sup.description}</p>
                    </div>
                    {sup.priority === 'high' && (
                      <span className="flex items-center gap-0.5 shrink-0 text-[10px] text-error">
                        <AlertCircle size={10} />
                        紧急
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-subtle">
                      {sup.familyMember.name} · {meta.label}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleResolve(sup.id)}
                      disabled={resolving === sup.id}
                      className="gap-1 shrink-0 h-7 px-2"
                    >
                      <Check size={11} />
                      已处理
                    </Button>
                  </div>

                  {sup.suggestedAction && (
                    <p className="mt-1.5 text-[10px] text-accent bg-accent/5 rounded-md px-2 py-1">
                      {sup.suggestedAction}
                    </p>
                  )}
                </motion.div>
              </GlassLayer>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </motion.div>
  );
}
