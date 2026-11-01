import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '中国石油大学（北京）校园地图',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/favicon.svg` },
  description:
    '中国石油大学（北京）昌平校区三维地图，支持地标搜索、游览和昼夜切换。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
