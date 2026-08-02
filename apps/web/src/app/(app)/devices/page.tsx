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
} from 'lucide-react';
import useSWR from 'swr';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/page-transition';
import { GlassLayer } from '@/components/glass';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FullScreenLoader } from '@/components/ui/loading';
import { apiClient, swrFetcher, ApiError } from '@/lib/api-client';

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
  | 'air_purifier';

type DeviceStatus = 'on' | 'off' | 'running' | 'idle' | 'charging';

type IoTPlatform = 'mihome' | 'homekit';

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
};

const PLATFORM_LABEL: Record<IoTPlatform, string> = {
  mihome: '米家',
  homekit: 'HomeKit',
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                ) : (
                  <Cpu size={18} className={bound ? 'text-success' : 'text-text-muted'} />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-text">{label}</p>
                <p className="text-xs text-text-subtle">
                  {bound
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

          {bound ? (
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
