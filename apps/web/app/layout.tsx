import type { Metadata } from 'next';
import { ThemeProvider, ToastProvider } from '@app/core';
import './globals.css';

export const metadata: Metadata = {
  title: 'CatchUP Design System',
  description:
    'CatchUP — a productive, enterprise design system built on IBM Carbon foundations.',
};

/**
 * Composition root — providers nested like onion layers (docs/01):
 * ThemeProvider → ToastProvider → App.
 * `suppressHydrationWarning` is required because next-themes sets the theme
 * class on <html> before React hydrates.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
