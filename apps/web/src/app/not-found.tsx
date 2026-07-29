import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-text">
      <h1 className="text-2xl font-display mb-2">页面未找到</h1>
      <p className="text-text-subtle mb-6">抱歉，你访问的页面不存在。</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
      >
        返回首页
      </Link>
    </div>
  );
}
