// 역할·메뉴 단일 정의처. id(영문)↔라벨(한글) 분리, ROLE_HOME, 메뉴 중앙배열 + role 필터.
// 근거: docs/1 §2(역할 모델·ROLE_HOME), §1 체크리스트("메뉴 중앙 배열 1곳 + menu.filter(role)").
// 순수 데이터/함수만 — 'server-only' 아님(클라 셸도 라벨·메뉴를 읽는다).

import type { IconName } from '@app/ui';

/** 전역 역할(M:N, auth.user_roles) — 사내 인원만. examinee/org_admin은 org 단위라 여기 없음. */
export type GlobalRole = 'admin' | 'author' | 'grader';
/** 조직 내 역할(auth.org_members.org_role) — org 단위 부여. */
export type OrgRole = 'examinee' | 'org_admin';

/** 셸/메뉴를 가르는 "청중" 3종. 라우트 group과 1:1(my/org/admin). */
export type Audience = 'examinee' | 'org_admin' | 'admin';

export const ROLE_LABELS: Record<GlobalRole | OrgRole, string> = {
  admin: '내부 관리자',
  author: '출제자',
  grader: '평가자',
  examinee: '학생',
  org_admin: '학교담당자',
};

/** 역할별 홈(로그인 직후 리다이렉트 대상). 우선순위 admin > org_admin > examinee. */
export const ROLE_HOME: Record<Audience, string> = {
  admin: '/admin/batches',
  org_admin: '/org/dashboard',
  examinee: '/my/exams',
};

/**
 * 한 사용자가 접근 가능한 청중 집합을 그가 가진 권한에서 산출.
 * - 전역 admin → 'admin' 청중
 * - org_role='org_admin'인 org이 하나라도 있으면 → 'org_admin' 청중
 * - org_role='examinee'인 org이 하나라도 있으면 → 'examinee' 청중
 * (프론트 UX용. 백엔드 보안은 guard가 별도로 재검사 — docs/1 §2 "프론트는 UX, 백엔드 재검사".)
 */
export function audiencesOf(input: {
  globalRoles: readonly GlobalRole[];
  orgRoles: readonly OrgRole[];
}): Audience[] {
  const out: Audience[] = [];
  if (input.globalRoles.includes('admin')) out.push('admin');
  if (input.orgRoles.includes('org_admin')) out.push('org_admin');
  if (input.orgRoles.includes('examinee')) out.push('examinee');
  return out;
}

/** 로그인 직후 보낼 홈. 가장 권한 높은 청중 기준. 접근 청중이 없으면 마케팅으로. */
export function homeFor(audiences: readonly Audience[]): string {
  if (audiences.includes('admin')) return ROLE_HOME.admin;
  if (audiences.includes('org_admin')) return ROLE_HOME.org_admin;
  if (audiences.includes('examinee')) return ROLE_HOME.examinee;
  return '/';
}

/** 셸 메뉴 항목. href = 실제 라우트(셸이 usePathname으로 활성 판정). */
export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  audience: Audience;
}

/**
 * 메뉴 중앙배열(단일 정의처). 청중별로 그룹지어진다.
 * 셸은 viewer의 audiences로 filter해 자기 것만 본다(docs/1 §1).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  // ── examinee(학생)
  { id: 'my-exams', label: '내 시험', icon: 'document', href: '/my/exams', audience: 'examinee' },
  { id: 'my-lecture', label: '강의', icon: 'view', href: '/my/lecture', audience: 'examinee' },
  // ── org_admin(학교담당자, 자기 대학만)
  { id: 'org-dashboard', label: '대시보드', icon: 'dashboard', href: '/org/dashboard', audience: 'org_admin' },
  { id: 'org-students', label: '학생', icon: 'user', href: '/org/students', audience: 'org_admin' },
  { id: 'org-batches', label: '회차', icon: 'calendar', href: '/org/batches', audience: 'org_admin' },
  // ── admin(사내, 풀권한)
  { id: 'admin-orgs', label: '대학(고객사)', icon: 'folder', href: '/admin/orgs', audience: 'admin' },
  { id: 'admin-batches', label: '회차 운영', icon: 'calendar', href: '/admin/batches', audience: 'admin' },
  { id: 'admin-students', label: '학생/계정', icon: 'user', href: '/admin/students', audience: 'admin' },
  { id: 'admin-problems', label: '문제·버전', icon: 'document', href: '/admin/problems', audience: 'admin' },
  { id: 'admin-submissions', label: '제출 검증', icon: 'data', href: '/admin/submissions', audience: 'admin' },
] as const;

/** viewer가 볼 수 있는 메뉴만. */
export function navFor(audiences: readonly Audience[]): NavItem[] {
  return NAV_ITEMS.filter((it) => audiences.includes(it.audience));
}

/** 청중 라벨(셸 헤더/그룹 제목용). */
export const AUDIENCE_LABELS: Record<Audience, string> = {
  examinee: '내 시험',
  org_admin: '우리 대학',
  admin: '플랫폼 관리',
};
