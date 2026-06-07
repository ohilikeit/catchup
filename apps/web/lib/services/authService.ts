import 'server-only';
import { usersRepo } from '../db';
import { verifyPassword, hashPassword } from '../auth/password';
import type { Session } from '../auth/session';

// authService — 로그인 비즈니스 로직. route handler는 얇게, 여기서 세션 조립.
// 근거: reference/01 §5(route → service → repository), docs/1 §2, reference/05(bcrypt).
// ⭐ 비밀번호는 bcrypt로 검증한다(평문 비교·평문 저장 금지). 임시비번도 같은 경로로 검증.

export interface LoginResult {
  ok: boolean;
  session?: Session;
  /** 임시비번 상태(아직 본인 비번으로 안 바꿈) → 로그인 후 변경 유도. */
  mustChangePassword?: boolean;
  error?: string;
}

/** 이메일+비밀번호 로그인. 사용자 + 전역역할 + 조직소속을 묶어 세션을 만든다. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const cred = await usersRepo.findCredentialByEmail(email.trim().toLowerCase());
  // 사용자 없음/비번 미설정/불일치 모두 동일 메시지(계정 존재 여부 노출 회피, reference/05).
  const GENERIC = '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (!cred) return { ok: false, error: GENERIC };
  if (!cred.isActive) return { ok: false, error: '비활성화된 계정입니다.' };
  if (!cred.passwordHash) return { ok: false, error: GENERIC }; // 매직링크 전용(미구현) 계정
  if (!password) return { ok: false, error: GENERIC };

  const okPw = await verifyPassword(password, cred.passwordHash);
  if (!okPw) return { ok: false, error: GENERIC };

  const [globalRoles, memberships] = await Promise.all([
    usersRepo.listGlobalRoles(cred.id),
    usersRepo.listOrgMemberships(cred.id),
  ]);

  const mustChangePassword = cred.passwordChangedAt === null;
  const session: Session = {
    userId: cred.id,
    email: cred.email,
    fullName: cred.fullName,
    globalRoles,
    orgs: memberships.map((m) => ({ orgId: m.orgId, orgRole: m.orgRole, orgName: m.orgName })),
    mustChangePassword,
  };
  return { ok: true, session, mustChangePassword };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/** 비밀번호 변경: 현재 비번 검증 → 새 비번 해시 저장(password_changed_at 갱신). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  if (newPassword.length < 8) return { ok: false, error: '새 비밀번호는 8자 이상이어야 합니다.' };
  if (newPassword === currentPassword) return { ok: false, error: '현재 비밀번호와 다른 값을 입력하세요.' };

  const cred = await usersRepo.findCredentialById(userId);
  if (!cred || !cred.passwordHash) return { ok: false, error: '계정을 찾을 수 없습니다.' };

  const okCurrent = await verifyPassword(currentPassword, cred.passwordHash);
  if (!okCurrent) return { ok: false, error: '현재 비밀번호가 올바르지 않습니다.' };

  await usersRepo.setPassword(userId, await hashPassword(newPassword));
  return { ok: true };
}

/** 로그인 화면의 빠른-로그인 버튼용 데모 계정(시드와 일치). 프로토타입 편의. */
export const DEMO_ACCOUNTS: { label: string; email: string; hint: string }[] = [
  { label: '학생', email: 'student1@univ-a.ac.kr', hint: 'examinee · A대학' },
  { label: '학교담당자', email: 'staff@univ-a.ac.kr', hint: 'org_admin · A대학' },
  { label: '내부 관리자', email: 'admin@catchup.io', hint: 'admin · 전체' },
];
