'use client';

import { useEffect } from 'react';
import { PageTransition } from '@/components/page-transition';
import { ImmersiveHome } from '@/components/home/immersive-home';
import { useFamilyHubStore } from '@/stores/family-hub-store';

/**
 * 岁言意识空间 —— 首页 V3
 *
 * 从「双侧面板控制台」回归到「家庭陪伴入口」：
 * - 大量留白、单栏滚动、分节清晰
 * - 用户第一眼看到的是「时墨」而不是指标
 * - 生命树、家庭状态、成长、技能、时间线自然展开
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
      <ImmersiveHome />
    </PageTransition>
  );
}
