import {
  Home,
  MessagesSquare,
  TreePine,
  Sparkles,
  Settings,
  BookOpen,
  Heart,
  Sprout,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const navItems: NavItem[] = [
  {
    label: '首页',
    href: '/',
    icon: Home,
    description: '概览与快捷操作',
  },
  {
    label: 'AI 访谈',
    href: '/interview',
    icon: MessagesSquare,
    description: '与 AI 生命教练对话',
  },
  {
    label: '生命树',
    href: '/life-tree',
    icon: TreePine,
    description: '探索生命的脉络',
  },
  {
    label: '数字生命中心',
    href: '/center',
    icon: Sparkles,
    description: '你的数字生命空间',
  },
  {
    label: '设置',
    href: '/settings',
    icon: Settings,
    description: '账户与偏好设置',
  },
];

/** Extended nav items for page title resolution (includes non-dock pages). */
export const allNavItems: NavItem[] = [
  ...navItems,
  {
    label: '家庭知识库',
    href: '/knowledge',
    icon: BookOpen,
    description: 'AI 统一管理家庭重要信息',
  },
  {
    label: '生活助手',
    href: '/life',
    icon: Heart,
    description: '时墨主动为家庭提供生活服务',
  },
  {
    label: '时墨 Skills',
    href: '/skills',
    icon: Sparkles,
    description: '查看时墨掌握的全部技能',
  },
  {
    label: '进化工坊',
    href: '/evolution',
    icon: Sprout,
    description: '时墨的自主进化与技能孵化',
  },
];

/** Resolve the page title for a given pathname. */
export function getPageTitle(pathname: string): string {
  if (pathname === '/') return '首页';
  const item = allNavItems.find((n) => n.href !== '/' && pathname.startsWith(n.href));
  return item?.label ?? '岁言';
}
