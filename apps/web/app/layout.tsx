import type { Metadata } from 'next';
import { ThemeProvider, ToastProvider } from '@app/core';
import './globals.css';

export const metadata: Metadata = {
  // 페이지별 title은 "%s · CatchUP"로 합성, 미지정 시 default 사용.
  title: {
    default: 'CatchUP — 실무형 AI 활용 역량 평가',
    template: '%s · CatchUP',
  },
  description:
    'Claude Code·Codex 같은 실무 코딩 에이전트를 직접 다루며 AI 활용 역량을 기르고, 과정과 결과로 객관적으로 증명하는 평가 플랫폼.',
  applicationName: 'CatchUP',
  openGraph: {
    type: 'website',
    siteName: 'CatchUP',
    title: 'CatchUP — 실무형 AI 활용 역량 평가',
    description:
      'AI를 쓰는 것과 AI로 일하는 것은 다릅니다. 실무 코딩 에이전트로 역량을 기르고 증명하세요.',
    locale: 'ko_KR',
  },
};

/**
 * Composition root — providers nested like onion layers (docs/01):
 * ThemeProvider → ToastProvider → App.
 * `suppressHydrationWarning` is required because next-themes sets the theme
 * class on <html> before React hydrates.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
