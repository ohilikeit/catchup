import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type Session } from './session';
import { audiencesOf, type Audience, type GlobalRole } from './roles';

// 서버측 인가의 단일 창구. docs/1 §2: "백엔드 역할 재검사 필수(프론트는 UX)".
// ⭐ org 스코프는 service에서 강제하지만, 페이지 진입 게이트는 여기서 1차로 막는다.
//   누수 방지의 핵심: 전역 role만으로 스코프하지 말 것 — org 소유권은 getMyOrgIds로 좁힌다.

/** 세션 필수. 없으면 로그인으로. (서버 컴포넌트 상단에서 호출) */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** 이 세션이 접근 가능한 청중 집합. */
export function audiencesForSession(session: Session): Audience[] {
  return audiencesOf({
    globalRoles: session.globalRoles,
    orgRoles: session.orgs.map((o) => o.orgRole),
  });
}

/** 특정 청중(섹션) 접근 게이트. 없으면 자기 홈으로 되돌림(권한 없는 섹션 차단). */
export async function requireAudience(audience: Audience): Promise<Session> {
  const session = await requireSession();
  if (!audiencesForSession(session).includes(audience)) {
    redirect('/login'); // 권한 밖 섹션 — 안전하게 로그인/홈으로
  }
  return session;
}

/** 전역 역할 필수(사내 admin 등). */
export async function requireGlobalRole(role: GlobalRole): Promise<Session> {
  const session = await requireSession();
  if (!session.globalRoles.includes(role)) redirect('/login');
  return session;
}

/**
 * ⭐ org 스코프의 원천: 이 사용자가 org_admin인 org id 목록.
 * org 쿼리는 반드시 `org_id IN (이 목록)`으로 좁힌다(A대학이 B대학 못 봄).
 * admin은 전체 접근이므로 호출부에서 별도 분기(여기선 org_admin 권한만 반환).
 */
export function myOrgAdminIds(session: Session): string[] {
  return session.orgs.filter((o) => o.orgRole === 'org_admin').map((o) => o.orgId);
}

/** 이 org에 대한 org_admin 소유권 확인(admin은 항상 통과). */
export function canAccessOrg(session: Session, orgId: string): boolean {
  if (session.globalRoles.includes('admin')) return true;
  return myOrgAdminIds(session).includes(orgId);
}

/** org 소유권 게이트(없으면 차단). */
export async function requireOrgAccess(orgId: string): Promise<Session> {
  const session = await requireSession();
  if (!canAccessOrg(session, orgId)) redirect('/login');
  return session;
}
