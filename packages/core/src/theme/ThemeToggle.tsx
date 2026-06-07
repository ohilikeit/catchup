'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@app/ui';

/** Icon button that flips between light and dark. Mounts client-side only to
 *  avoid a hydration mismatch on the theme-dependent icon. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      kind="ghost"
      size="field"
      iconOnly
      icon={mounted && isDark ? 'sun' : 'moon'}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    />
  );
}
