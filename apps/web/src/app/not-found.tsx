import Link from 'next/link';
import { Home, MessagesSquare, Users, Settings, Orbit } from 'lucide-react';

const suggestions = [
  { href: '/', label: '首页', icon: Home },
  { href: '/interview', label: '陪伴访谈', icon: MessagesSquare },
  { href: '/family', label: '家庭', icon: Users },
  { href: '/life-tree', label: '生命核心', icon: Orbit },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-text px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-display font-bold text-accent mb-4">404</p>
        <h1 className="text-2xl font-display mb-2">页面未找到</h1>
        <p className="text-text-subtle mb-8">
          抱歉，你访问的页面不存在或已被移动。试试下面的导航链接吧。
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {suggestions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-4 py-5 text-sm text-text-muted transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-text focus-ring"
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        <Link
          href="/"
          className="mt-8 inline-block px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary-hover focus-ring"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
