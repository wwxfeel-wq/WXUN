import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '岁言 SuiYan - Family AI Hub',
  description: '真正懂整个家庭的 AI。连接家庭 · 沉淀记忆 · 陪伴成长',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: 'var(--color-bg-elevated)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased bg-background text-text font-crisp">
        {children}
      </body>
    </html>
  );
}
