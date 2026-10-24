import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/global.css';
import { ThemeScript } from '@/features/core/components/theme/ThemeScript';
import { ToastProvider } from '@/features/core/components/ui/Toast';

export const metadata: Metadata = {
  title: { default: 'CommonGround', template: '%s · CommonGround' },
  description: 'Find your people nearby. A personal AI agent that brings neighbors together.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F0F2F5' },
    { media: '(prefers-color-scheme: dark)', color: '#18191A' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
