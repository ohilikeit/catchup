'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@app/ui';
import { ThemeToggle } from '@app/core';

const LINKS = [
  { href: '/', label: 'Design system' },
  { href: '/console', label: 'Console kit' },
];

/** Carbon-style productive top bar used across the showcase pages. */
export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 h-12 flex items-center bg-shell text-shell-text border-b border-shell-border">
      <div className="px-05 font-sans text-sm leading-none whitespace-nowrap tracking-[0.1px]">
        CatchUP <b className="font-semibold">Design System</b>
      </div>
      <nav className="flex h-full">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'flex items-center px-05 h-full font-sans text-sm leading-none text-shell-text-secondary no-underline border-b-2 border-transparent hover:bg-shell-hover hover:text-shell-text',
                active && 'text-shell-text border-shell-accent',
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="text-shell-text-secondary">
        <ThemeToggle />
      </div>
    </header>
  );
}
