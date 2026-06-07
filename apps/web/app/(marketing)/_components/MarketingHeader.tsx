'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, Button, Icon } from '@app/ui';
import { ThemeToggle } from '@app/core';
import { MarketingContainer } from './MarketingContainer';

const LINKS = [
  { href: '/how-it-works', label: '진행 방식' },
  { href: '/curriculum', label: '커리큘럼' },
  { href: '/sample-report', label: '샘플 리포트' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-shell text-shell-text border-b border-shell-border">
      {/* 다크 바는 full-bleed, 내부 콘텐츠는 공유 컨테이너에 정렬 → 본문 좌측과 일치 */}
      <MarketingContainer className="flex items-center h-12">
        <div className="font-sans text-sm leading-none whitespace-nowrap tracking-[0.1px] flex-shrink-0 pr-05">
          <Link href="/" className="no-underline text-shell-text hover:text-shell-text">
            CatchUP
          </Link>
        </div>
        {/* 데스크톱 내비(md 이상) */}
        <nav className="hidden md:flex h-12">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
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
        <div className="flex items-center gap-02 text-shell-text-secondary">
          <ThemeToggle />
          <Button kind="ghost" size="sm" asChild className="text-shell-text-secondary hover:text-shell-text">
            <Link href="/login">로그인</Link>
          </Button>
          {/* 모바일 메뉴 버튼(md 미만) */}
          <button
            type="button"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="md:hidden w-8 h-8 flex items-center justify-center text-shell-text-secondary hover:text-shell-text hover:bg-shell-hover"
          >
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </MarketingContainer>

      {/* 모바일 드롭다운 패널(md 미만, 열렸을 때만) */}
      {open && (
        <nav className="md:hidden border-t border-shell-border">
          <MarketingContainer className="py-02">
            {LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center h-control-md px-02 font-sans text-sm no-underline text-shell-text-secondary hover:text-shell-text',
                    active && 'text-shell-text font-semibold',
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </MarketingContainer>
        </nav>
      )}
    </header>
  );
}
