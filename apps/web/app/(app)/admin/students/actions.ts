'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { usersRepo } from '@/lib/db';

// admin/students 서버 액션 — 사용자 비활성화(소프트, 가역) + 삭제(하드, 응시 0일 때만).
// 정책: attempts.examinee_id 는 FK가 아니라(약한참조) DB가 막지 않으므로, 삭제 전 응시 건수를
// 앱이 직접 판정한다 — 응시 이력이 있으면 비활성화로만(시험 기록 보존, 0002 주석).

export async function setStudentActiveAction(
  userId: string,
  isActive: boolean,
): Promise<{ ok: boolean; message: string }> {
  await requireGlobalRole('admin');
  const ok = await usersRepo.setActive(userId, isActive);
  revalidatePath('/admin/students');
  return {
    ok,
    message: ok ? (isActive ? '사용자를 활성화했습니다.' : '사용자를 비활성화했습니다.') : '사용자를 찾을 수 없습니다.',
  };
}

export async function deleteStudentAction(userId: string): Promise<{ ok: boolean; message: string }> {
  await requireGlobalRole('admin');
  const attempts = await usersRepo.countAttempts(userId);
  if (attempts > 0) {
    return { ok: false, message: `응시 이력이 ${attempts}건 있어 삭제할 수 없습니다. 비활성화로 내리세요(기록 보존).` };
  }
  await usersRepo.deleteUser(userId);
  revalidatePath('/admin/students');
  return { ok: true, message: '사용자를 삭제했습니다.' };
}
