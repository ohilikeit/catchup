import { requireSession, audiencesForSession } from '@/lib/auth/guard';
import { navFor, AUDIENCE_LABELS, type Audience } from '@/lib/auth/roles';
import { initialsOf } from '@/lib/auth/session';
import { AppShell } from './_components/AppShell';

// (app) 영속 셸 레이아웃(서버). 세션→청중→메뉴를 계산해 클라 셸에 주입.
// 인가 1차 게이트: 세션 없으면 requireSession이 /login으로(docs/1 §2 "백엔드 재검사").

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const audiences = audiencesForSession(session);
  const nav = navFor(audiences);

  const primary: Audience = audiences.includes('admin')
    ? 'admin'
    : audiences.includes('org_admin')
      ? 'org_admin'
      : 'examinee';

  const brandSecond = primary === 'admin' ? 'Admin' : primary === 'org_admin' ? 'Console' : 'Exam';

  return (
    <AppShell
      nav={nav}
      category={AUDIENCE_LABELS[primary]}
      brand={['CatchUP', brandSecond]}
      userInitials={initialsOf(session.fullName)}
      mustChangePassword={session.mustChangePassword ?? false}
    >
      {children}
    </AppShell>
  );
}
