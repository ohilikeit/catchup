'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AppHeader, SideNav, Notification, cn, type SideNavItem } from '@app/ui';
import type { NavItem } from '@/lib/auth/roles';

// 영속 대시보드 셸(클라이언트). kit은 순수 부품 → 여기서 usePathname/useRouter로 라우팅 결선.
// 근거: docs/1 §1("셸 = props 주입형 순수 부품, 라우팅은 앱 책임").
//
// 반응형: lg 이상은 사이드냅이 본문 옆 고정 컬럼. lg 미만은 기본 닫힘 + 메뉴 버튼으로 여는
// 오버레이 드로어(+백드롭). 좁은 폭에서 본문이 짓눌리지 않게 한다(Codex 반응형 리뷰 대응).

export interface AppShellProps {
  nav: NavItem[];
  category: string;
  brand: [string, string];
  userInitials: string;
  mustChangePassword?: boolean;
  children: React.ReactNode;
}

export function AppShell({ nav, category, brand, userInitials, mustChangePassword, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  // 모바일 드로어 열림 상태. 기본 닫힘(작은 화면). 데스크톱(lg+)은 CSS로 항상 표시.
  const [navOpen, setNavOpen] = useState(false);

  // 활성 항목 = 현재 경로가 그 href로 시작하는 것 중 가장 긴 매칭(중첩 라우트 대응).
  const active = nav
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.id;

  const items: SideNavItem[] = nav.map((it) => ({ id: it.id, label: it.label, icon: it.icon }));

  function go(id: string) {
    const item = nav.find((n) => n.id === id);
    if (item) router.push(item.href);
    setNavOpen(false); // 모바일에서 항목 선택 시 드로어 닫기
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex flex-col h-screen bg-layer-01">
      <AppHeader
        nav={['로그아웃']}
        onNav={logout}
        onMenu={() => setNavOpen((o) => !o)}
        onBrand={() => router.push('/')}
        brand={brand}
        user={userInitials}
      />
      <div className="flex flex-1 min-h-0 relative">
        {/* 모바일 백드롭 (lg 이상에선 숨김) */}
        {navOpen && (
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 top-12 z-30 bg-[rgba(22,22,22,0.5)] lg:hidden"
          />
        )}
        {/* 사이드냅: lg 미만 = 오버레이 드로어, lg 이상 = 정적 컬럼 */}
        <div
          className={cn(
            'z-40 transition-transform duration-moderate-01 ease-productive',
            'fixed top-12 bottom-0 left-0',
            navOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:static lg:top-auto lg:bottom-auto lg:translate-x-0 lg:z-auto',
          )}
        >
          <SideNav items={items} active={active} onSelect={go} category={category} />
        </div>
        <main className="flex-1 min-w-0 overflow-y-auto">
          {mustChangePassword && !pathname.startsWith('/change-password') && (
            <div className="px-05 pt-05 lg:px-07">
              <Notification kind="warning" title="임시 비밀번호 사용 중">
                보안을 위해 비밀번호를 변경하세요.{' '}
                <Link href="/change-password" className="underline text-link-primary">지금 변경하기</Link>
              </Notification>
            </div>
          )}
          <div className="px-05 pt-05 pb-10 lg:px-07 lg:pt-07 max-w-[1056px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
