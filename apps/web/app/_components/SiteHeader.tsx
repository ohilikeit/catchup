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
    <header className="sticky top-0 z-20 h-12 flex items-center bg-gray-100 text-white border-b border-[#393939]">
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
                'flex items-center px-05 h-full font-sans text-sm leading-none text-gray-30 no-underline border-b-2 border-transparent hover:bg-[#2c2c2c] hover:text-white',
                active && 'text-white border-blue-60',
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="text-gray-30">
        <ThemeToggle />
      </div>
    </header>
  );
}
