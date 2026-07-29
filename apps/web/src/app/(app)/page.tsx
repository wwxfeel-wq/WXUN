'use client';

import { useEffect } from 'react';
import { PageTransition } from '@/components/page-transition';
import { SpatialHome } from '@/components/home/spatial-home';
import { useFamilyHubStore } from '@/stores/family-hub-store';

/**
 * 岁言意识空间 —— 首页 V3 Spatial
 *
 * 从「双侧面板控制台」转向「未来家庭 AI 操作系统」：
 * - 深蓝黑空间背景 + 高级液态玻璃卡片
 * - 中心：粒子神经生命云（SuiYan Life Core）
 * - 周围：悬浮状态信息面板 + 底部时间线 + 优雅输入框
 * - 视觉气质：Apple Vision Pro + Linear + AI生命体 + 家庭记忆
 */
export default function HomePage() {
  const fetchAll = useFamilyHubStore((s) => s.fetchAll);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchAll();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <PageTransition>
      <SpatialHome />
    </PageTransition>
  );
}
