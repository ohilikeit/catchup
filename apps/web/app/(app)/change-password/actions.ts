'use server';
import { requireSession } from '@/lib/auth/guard';
import { getSession, setSessionCookie } from '@/lib/auth/session';
import { changePassword } from '@/lib/services/authService';

// 비밀번호 변경 server action. 인증 필수, service가 현재 비번 검증·새 비번 해시 저장.
// 성공 시 세션 쿠키를 재발급해 mustChangePassword 플래그를 해제(배너 사라짐).

export type ChangePwActionResult = { ok: true } | { ok: false; error: string };

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePwActionResult> {
  const session = await requireSession();
  const result = await changePassword(session.userId, currentPassword, newPassword);
  if (!result.ok) return result;

  const cur = await getSession();
  if (cur) setSessionCookie({ ...cur, mustChangePassword: false });
  return { ok: true };
}
